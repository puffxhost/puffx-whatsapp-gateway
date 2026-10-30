import { createHash, randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { pool } from "./db.js";
declare module "express-session" {
  interface SessionData {
    userId?: string;
    role?: string;
  }
}
export const hashKey = (s: string) =>
  createHash("sha256")
    .update(`${process.env.API_KEY_PEPPER}:${s}`)
    .digest("hex");
export const newApiKey = () => `pfx_${randomBytes(32).toString("base64url")}`;
export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId)
    return res.status(401).json({
      error: { code: "UNAUTHENTICATED", message: "Sign in required" },
    });
  next();
}
export async function apiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const bearer = req
      .header("authorization")
      ?.match(/^Bearer\s+(pfx_[\w-]+)$/)?.[1];
    if (!bearer)
      return res.status(401).json({
        error: {
          code: "INVALID_API_KEY",
          message: "Provide a Puffx API key in Authorization: Bearer",
        },
      });
    const digest = hashKey(bearer);
    const row = await pool.query(
      "SELECT id,user_id,session_id,permissions FROM api_keys WHERE key_hash=$1 AND revoked_at IS NULL",
      [digest],
    );
    if (!row.rowCount)
      return res.status(401).json({
        error: {
          code: "INVALID_API_KEY",
          message: "API key is invalid or revoked",
        },
      });
    await pool.query("UPDATE api_keys SET last_used_at=now() WHERE id=$1", [
      row.rows[0].id,
    ]);
    res.locals.apiKey = row.rows[0];
    next();
  } catch (e) {
    next(e);
  }
}
