import "dotenv/config";
import { access } from "node:fs/promises";
import path from "node:path";
import express from "express";
import session from "express-session";
import pgSession from "connect-pg-simple";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool, migrate, audit } from "./db.js";
import { requireUser, apiKeyAuth, newApiKey, hashKey } from "./auth.js";
import { BaileysProvider } from "./provider.js";
const app = express(),
  PgStore = pgSession(session),
  provider = new BaileysProvider();
const originList = (
  process.env.ALLOWED_ORIGINS ?? "http://127.0.0.1:3000"
).split(",");
app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: originList, credentials: true }));
app.use(express.json({ limit: "128kb" }));
app.use(
  session({
    name: "puffx.sid",
    store: new PgStore({ pool, createTableIfMissing: true }),
    secret:
      process.env.SESSION_SECRET ?? "development-only-change-this-secret-now",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "true",
      maxAge: 8 * 60 * 60 * 1000,
    },
  }),
);
const authLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
const apiLimit = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
app.get("/api/v1/health", (_q, r) => r.json({ status: "ok" }));
app.get("/api/v1/ready", async (_q, r) => {
  try {
    await pool.query("SELECT 1");
    r.json({ status: "ready", database: "ok" });
  } catch {
    r.status(503).json({ status: "not_ready" });
  }
});
app.post("/api/v1/auth/register", authLimit, async (req, res, next) => {
  try {
    const v = z
      .object({
        email: z.string().email().max(254),
        password: z.string().min(12).max(128),
      })
      .parse(req.body);
    const hash = await bcrypt.hash(v.password, 12);
    const { rows } = await pool.query(
      "INSERT INTO users(email,password_hash) VALUES(lower($1),$2) RETURNING id,email,role",
      [v.email, hash],
    );
    req.session.userId = rows[0].id;
    req.session.role = rows[0].role;
    res.status(201).json({ user: { id: rows[0].id, email: rows[0].email } });
  } catch (e: any) {
    if (e?.code === "23505")
      return res.status(409).json({
        error: { code: "EMAIL_EXISTS", message: "Account already exists" },
      });
    next(e);
  }
});
app.post("/api/v1/auth/login", authLimit, async (req, res, next) => {
  try {
    const v = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .parse(req.body);
    const { rows } = await pool.query(
      "SELECT id,email,password_hash,role FROM users WHERE email=lower($1)",
      [v.email],
    );
    if (!rows[0] || !(await bcrypt.compare(v.password, rows[0].password_hash)))
      return res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Email or password is incorrect",
        },
      });
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = rows[0].id;
      req.session.role = rows[0].role;
      res.json({ user: { id: rows[0].id, email: rows[0].email } });
    });
  } catch (e) {
    next(e);
  }
});
app.post("/api/v1/auth/logout", requireUser, (req, res) =>
  req.session.destroy(() => res.status(204).end()),
);
app.get("/api/v1/auth/me", requireUser, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id,email,role,created_at FROM users WHERE id=$1",
    [req.session.userId],
  );
  res.json({ user: rows[0] });
});
app.use("/api/v1", apiLimit);
app.post("/api/v1/sessions", requireUser, async (req, res, next) => {
  try {
    const v = z
      .object({ name: z.string().trim().min(1).max(80) })
      .parse(req.body);
    const { rows } = await pool.query(
      "INSERT INTO sessions(user_id,name) VALUES($1,$2) RETURNING *",
      [req.session.userId, v.name],
    );
    await audit(req.session.userId, "session.created", rows[0].id, req.ip);
    res.status(201).json({ session: rows[0] });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/sessions", requireUser, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT id,name,status,phone,last_connected_at,created_at FROM sessions WHERE user_id=$1 ORDER BY created_at DESC",
      [req.session.userId],
    );
    res.json({ sessions: rows });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/sessions/:id", requireUser, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT id,name,status,phone,last_connected_at,created_at FROM sessions WHERE id=$1 AND user_id=$2",
      [String(req.params.id), req.session.userId],
    );
    if (!rows[0])
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Session not found" } });
    res.json({ session: rows[0] });
  } catch (e) {
    next(e);
  }
});
async function ownerSession(id: string, user: string) {
  const r = await pool.query(
    "SELECT id,status FROM sessions WHERE id=$1 AND user_id=$2",
    [id, user],
  );
  return r.rows[0] as { id: string; status: string } | undefined;
}
function publishSession(id: string, event: any) {
  void pool.query(
    "UPDATE sessions SET status=$2,phone=COALESCE($3,phone),last_connected_at=CASE WHEN $2='connected' THEN now() ELSE last_connected_at END,updated_at=now() WHERE id=$1",
    [id, event.status, event.phone ?? null],
  );
}
app.post(
  "/api/v1/sessions/:id/pairing/qr",
  requireUser,
  async (req, res, next) => {
    try {
      const s = await ownerSession(String(req.params.id), req.session.userId!);
      if (!s)
        return res
          .status(404)
          .json({ error: { code: "NOT_FOUND", message: "Session not found" } });
      await pool.query("UPDATE sessions SET status='connecting' WHERE id=$1", [
        s.id,
      ]);
      await provider.connect(s.id, (event) => {
        if (event.type === "qr") {
          void import("qrcode")
            .then((q) => q.default.toDataURL(event.qr))
            .then((qr) => {
              qrCache.set(s.id, qr);
              setTimeout(() => qrCache.delete(s.id), 60_000).unref();
            });
        } else publishSession(s.id, event);
      });
      const existing = qrCache.get(s.id);
      if (existing) return res.json({ status: "qr", qrCodeDataUrl: existing });
      res.status(202).json({
        status: "connecting",
        message:
          "Pairing started; poll GET /api/v1/sessions/:id/pairing/qr for the QR image",
      });
    } catch (e) {
      next(e);
    }
  },
);
const qrCache = new Map<string, string>();
app.get("/api/v1/sessions/:id/pairing/qr", requireUser, async (req, res) => {
  const s = await ownerSession(String(req.params.id), req.session.userId!);
  if (!s)
    return res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Session not found" } });
  const qr = qrCache.get(s.id);
  res.json(qr ? { status: "qr", qrCodeDataUrl: qr } : { status: s.status });
});
const pairingAttempts = new Map<string, number[]>();
app.post(
  "/api/v1/sessions/:id/pairing/phone",
  requireUser,
  async (req, res, next) => {
    try {
      const s = await ownerSession(String(req.params.id), req.session.userId!);
      if (!s)
        return res
          .status(404)
          .json({ error: { code: "NOT_FOUND", message: "Session not found" } });
      const v = z
        .object({ phone: z.string().regex(/^\+?[1-9]\d{7,14}$/) })
        .parse(req.body);
      const now = Date.now(),
        arr = (pairingAttempts.get(req.session.userId!) ?? []).filter(
          (t) => now - t < 3600000,
        );
      if (arr.length >= 5)
        return res.status(429).json({
          error: {
            code: "PAIRING_RATE_LIMIT",
            message: "Maximum five pairing attempts per hour",
          },
        });
      arr.push(now);
      pairingAttempts.set(req.session.userId!, arr);
      await provider.connect(s.id, (e) => {
        if (e.type === "status") publishSession(s.id, e);
      });
      const code = await provider.requestPairingCode(
        s.id,
        v.phone.replace("+", ""),
      );
      res.json({ status: "pairing", pairingCode: code, expiresInSeconds: 60 });
    } catch (e) {
      next(e);
    }
  },
);
app.post(
  "/api/v1/sessions/:id/reconnect",
  requireUser,
  async (req, res, next) => {
    try {
      const s = await ownerSession(String(req.params.id), req.session.userId!);
      if (!s)
        return res
          .status(404)
          .json({ error: { code: "NOT_FOUND", message: "Session not found" } });
      await provider.connect(s.id, (e) => {
        if (e.type === "status") publishSession(s.id, e);
      });
      res.status(202).json({ status: "connecting" });
    } catch (e) {
      next(e);
    }
  },
);
app.post("/api/v1/sessions/:id/logout", requireUser, async (req, res, next) => {
  try {
    const s = await ownerSession(String(req.params.id), req.session.userId!);
    if (!s)
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Session not found" } });
    await provider.disconnect(s.id, true);
    await pool.query(
      "UPDATE sessions SET status='logged_out',updated_at=now() WHERE id=$1",
      [s.id],
    );
    res.json({ status: "logged_out" });
  } catch (e) {
    next(e);
  }
});
app.delete("/api/v1/sessions/:id", requireUser, async (req, res, next) => {
  try {
    const s = await ownerSession(String(req.params.id), req.session.userId!);
    if (!s)
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Session not found" } });
    await provider.disconnect(s.id, true);
    await pool.query("DELETE FROM sessions WHERE id=$1", [s.id]);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
app.post("/api/v1/api-keys", requireUser, async (req, res, next) => {
  try {
    const v = z
      .object({ name: z.string().min(1).max(80), sessionId: z.string().uuid() })
      .parse(req.body);
    if (!(await ownerSession(v.sessionId, req.session.userId!)))
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Session not found" } });
    const key = newApiKey(),
      prefix = key.slice(0, 12);
    const { rows } = await pool.query(
      "INSERT INTO api_keys(user_id,session_id,name,key_hash,prefix) VALUES($1,$2,$3,$4,$5) RETURNING id,name,session_id,permissions,created_at",
      [req.session.userId, v.sessionId, v.name, hashKey(key), prefix],
    );
    res.status(201).json({
      apiKey: rows[0],
      secret: key,
      warning: "Copy this key now. It cannot be shown again.",
    });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/api-keys", requireUser, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT id,name,session_id,prefix,permissions,created_at,last_used_at,revoked_at FROM api_keys WHERE user_id=$1 ORDER BY created_at DESC",
      [req.session.userId],
    );
    res.json({ apiKeys: rows });
  } catch (e) {
    next(e);
  }
});
app.delete("/api/v1/api-keys/:id", requireUser, async (req, res, next) => {
  try {
    const r = await pool.query(
      "UPDATE api_keys SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL",
      [String(req.params.id), req.session.userId],
    );
    if (!r.rowCount)
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "API key not found" } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
app.post("/api/v1/messages/send", apiKeyAuth, async (req, res, next) => {
  try {
    const v = z
      .object({
        sessionId: z.string().uuid(),
        to: z.string().regex(/^[1-9]\d{7,14}$/),
        type: z.literal("text"),
        message: z.string().min(1).max(4096),
      })
      .parse(req.body);
    const key = res.locals.apiKey as {
      user_id: string;
      session_id: string | null;
    };
    if (key.session_id && key.session_id !== v.sessionId)
      return res.status(403).json({
        error: {
          code: "SESSION_FORBIDDEN",
          message: "API key is restricted to another session",
        },
      });
    const { rows } = await pool.query(
      "SELECT status FROM sessions WHERE id=$1 AND user_id=$2",
      [v.sessionId, key.user_id],
    );
    if (!rows[0])
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Session not found" } });
    if (rows[0].status !== "connected")
      return res.status(409).json({
        error: {
          code: "SESSION_NOT_CONNECTED",
          message: "Connect the session before sending",
        },
      });
    const idem = req.header("idempotency-key")?.slice(0, 200) || null;
    const inserted = await pool.query(
      "INSERT INTO messages(user_id,session_id,idempotency_key,to_number,type,body,status) VALUES($1,$2,$3,$4,'text',$5,'sending') ON CONFLICT(session_id,idempotency_key) DO NOTHING RETURNING id,status",
      [key.user_id, v.sessionId, idem, v.to, v.message],
    );
    if (!inserted.rowCount) {
      const prev = await pool.query(
        "SELECT id,status FROM messages WHERE session_id=$1 AND idempotency_key=$2",
        [v.sessionId, idem],
      );
      return res.status(200).json({ message: prev.rows[0] });
    }
    const msg = inserted.rows[0];
    try {
      const result = await provider.sendText(v.sessionId, v.to, v.message);
      const updated = await pool.query(
        "UPDATE messages SET status='sent',provider_message_id=$2,updated_at=now() WHERE id=$1 RETURNING id,status,provider_message_id,created_at",
        [msg.id, result.id],
      );
      res.status(202).json({
        message: updated.rows[0],
        note: "Sent means accepted by the provider; delivery/read are unknown until provider events confirm them.",
      });
    } catch (err) {
      await pool.query(
        "UPDATE messages SET status='failed',error_code='PROVIDER_ERROR',updated_at=now() WHERE id=$1",
        [msg.id],
      );
      throw err;
    }
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/messages", requireUser, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100),
      before = req.query.before ? new Date(String(req.query.before)) : null;
    const { rows } = await pool.query(
      "SELECT id,session_id,to_number,type,status,provider_message_id,error_code,created_at,updated_at FROM messages WHERE user_id=$1 AND ($2::timestamptz IS NULL OR created_at<$2) ORDER BY created_at DESC LIMIT $3",
      [req.session.userId, before, limit],
    );
    res.json({ messages: rows });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/messages/:id", requireUser, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT id,session_id,to_number,type,status,provider_message_id,error_code,created_at,updated_at FROM messages WHERE id=$1 AND user_id=$2",
      [String(req.params.id), req.session.userId],
    );
    if (!rows[0])
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Message not found" } });
    res.json({ message: rows[0] });
  } catch (e) {
    next(e);
  }
});
app.get("/docs/openapi.yaml", (_req, res) =>
  res.type("yaml").sendFile(path.resolve("docs/openapi.yaml")),
);
app.use(express.static("apps/dashboard/dist"));
app.get(/^(?!\/api\/).*/, (_req, res, next) =>
  res.sendFile("index.html", { root: "apps/dashboard/dist" }, (err) => {
    if (err) next();
  }),
);
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (err instanceof z.ZodError)
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: err.issues.map((i) => ({
            path: i.path,
            message: i.message,
          })),
        },
      });
    console.error("request_failed", err?.message ?? "unknown");
    res
      .status(500)
      .json({ error: { code: "INTERNAL_ERROR", message: "Request failed" } });
    void _next;
  },
);
const port = Number(process.env.PORT ?? 3000),
  host = process.env.HOST ?? "127.0.0.1";
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.SESSION_SECRET ||
    process.env.SESSION_SECRET.length < 32 ||
    !process.env.API_KEY_PEPPER ||
    process.env.API_KEY_PEPPER.length < 32)
)
  throw new Error(
    "Production requires SESSION_SECRET and API_KEY_PEPPER of at least 32 characters",
  );
await migrate();
const authRoot = path.resolve(
  process.env.WHATSAPP_AUTH_DIR ?? "./data/whatsapp",
);
const saved = await pool.query(
  "SELECT id FROM sessions WHERE status IN ('connected','connecting','disconnected')",
);
for (const row of saved.rows) {
  try {
    await access(path.join(authRoot, row.id, "creds.json"));
    void provider.connect(row.id, (event) => {
      if (event.type === "status") publishSession(row.id, event);
    });
  } catch {
    /* no saved auth state to recover; require explicit pairing */
  }
}
const server = app.listen(port, host, () =>
  console.log(`Puffx API listening on ${host}:${port}`),
);
async function shutdown() {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await provider.closeAll();
  await pool.end();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
