import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
type Session = {
  id: string;
  name: string;
  status: string;
  phone?: string;
  created_at: string;
};
function App() {
  const [user, setUser] = useState<any>(null),
    [sessions, setSessions] = useState<Session[]>([]),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [key, setKey] = useState(""),
    [qr, setQr] = useState("");
  const call = async (path: string, body?: any, method = "GET") => {
    const r = await fetch("/api/v1" + path, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const d = r.status === 204 ? {} : await r.json();
    if (!r.ok) throw new Error(d.error?.message || "Request failed");
    return d;
  };
  const refresh = async () => {
    try {
      const me = await call("/auth/me");
      setUser(me.user);
      const s = await call("/sessions");
      setSessions(s.sessions);
    } catch {
      setUser(null);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  const login = async (register = false) => {
    setError("");
    try {
      const r = await call(
        `/auth/${register ? "register" : "login"}`,
        { email, password },
        "POST",
      );
      setUser(r.user);
      await refresh();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const addSession = async () => {
    const name = prompt("Name this WhatsApp account");
    if (!name) return;
    try {
      const r = await call("/sessions", { name }, "POST");
      setSessions([r.session, ...sessions]);
    } catch (e: any) {
      setError(e.message);
    }
  };
  const pair = async (id: string, method: "qr" | "phone") => {
    setError("");
    setQr("");
    try {
      if (method === "phone") {
        const phone = prompt(
          "Phone number with country code, e.g. +919876543210",
        );
        if (!phone) return;
        const r = await call(
          `/sessions/${id}/pairing/phone`,
          { phone },
          "POST",
        );
        alert(
          `Enter this pairing code in WhatsApp Linked Devices: ${r.pairingCode}`,
        );
        const poll = async () => {
          const x = await call("/sessions");
          setSessions(x.sessions);
          if (
            x.sessions.find((s: Session) => s.id === id)?.status !== "connected"
          )
            setTimeout(poll, 2000);
        };
        void poll();
      } else {
        await call(`/sessions/${id}/pairing/qr`, {}, "POST");
        const poll = async () => {
          const r = await call(`/sessions/${id}/pairing/qr`);
          if (r.qrCodeDataUrl) setQr(r.qrCodeDataUrl);
          if (r.status === "connected") {
            await refresh();
            return;
          }
          setTimeout(poll, 1500);
        };
        await poll();
      }
    } catch (e: any) {
      setError(e.message);
    }
  };
  const createKey = async (id: string) => {
    try {
      const r = await call(
        "/api-keys",
        { name: "Dashboard key", sessionId: id },
        "POST",
      );
      setKey(r.secret);
    } catch (e: any) {
      setError(e.message);
    }
  };
  if (!user)
    return (
      <main className="login">
        <section className="card auth">
          <div className="logo">P</div>
          <p className="eyebrow">PUFFX GATEWAY</p>
          <h1>Your WhatsApp, connected.</h1>
          <p className="muted">
            Sign in to manage your accounts and API access.
          </p>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 12 characters"
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button onClick={() => void login()} className="primary">
            Sign in
          </button>
          <button className="text" onClick={() => void login(true)}>
            Create an account
          </button>
        </section>
      </main>
    );
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span className="logo small">P</span> puffx{" "}
          <span className="tag">GATEWAY</span>
        </div>
        <nav>
          <a className="active">◈ &nbsp; Overview</a>
          <a onClick={() => void addSession()}>▣ &nbsp; WhatsApp sessions</a>
          <a href="#keys">⌘ &nbsp; API keys</a>
          <a href="#history">◷ &nbsp; Message history</a>
          <a href="/docs/openapi.yaml">⌑ &nbsp; API reference</a>
        </nav>
        <div className="sidefoot">
          <span className="dot"></span> Gateway operational
        </div>
      </aside>
      <main className="content">
        <header>
          <div>
            <p className="eyebrow">WORKSPACE / OVERVIEW</p>
            <h1>Good to see you</h1>
          </div>
          <button
            className="outline"
            onClick={() =>
              void call("/auth/logout", {}, "POST").then(() => setUser(null))
            }
          >
            Sign out
          </button>
        </header>
        {error && <div className="error wide">{error}</div>}
        <div className="stats">
          <article className="card stat">
            <small>ALL SESSIONS</small>
            <strong>{sessions.length}</strong>
            <span>WhatsApp accounts</span>
          </article>
          <article className="card stat">
            <small>CONNECTED</small>
            <strong>
              {sessions.filter((s) => s.status === "connected").length}
            </strong>
            <span>Ready to send</span>
          </article>
          <article className="card stat">
            <small>DISCONNECTED</small>
            <strong>
              {sessions.filter((s) => s.status !== "connected").length}
            </strong>
            <span>Need attention</span>
          </article>
        </div>
        <section className="card panel">
          <div className="panelhead">
            <div>
              <p className="eyebrow">ACCOUNTS</p>
              <h2>WhatsApp sessions</h2>
            </div>
            <button className="primary" onClick={() => void addSession()}>
              ＋ Add session
            </button>
          </div>
          {sessions.length === 0 ? (
            <div className="empty">
              <div className="emptyicon">▣</div>
              <h3>No accounts connected yet</h3>
              <p>
                Create a session to pair a WhatsApp account using a QR code or
                pairing code.
              </p>
              <button className="outline" onClick={() => void addSession()}>
                Create your first session
              </button>
            </div>
          ) : (
            <div className="list">
              {sessions.map((s) => (
                <div className="session" key={s.id}>
                  <div className="waicon">◉</div>
                  <div className="sessioninfo">
                    <strong>{s.name}</strong>
                    <span>
                      {s.phone || s.id.slice(0, 8)} · Added{" "}
                      {new Date(s.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <span className={"badge " + s.status}>
                    <i></i>
                    {s.status}
                  </span>
                  <div className="actions">
                    <button onClick={() => void pair(s.id, "qr")}>
                      QR pair
                    </button>
                    <button onClick={() => void pair(s.id, "phone")}>
                      Pairing code
                    </button>
                    <button onClick={() => void createKey(s.id)}>
                      Create API key
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {qr && (
            <div className="qrbox">
              <h3>Scan with WhatsApp → Linked devices</h3>
              <img src={qr} />
              <button onClick={() => setQr("")}>Close</button>
            </div>
          )}
        </section>
        {key && (
          <section className="card keybox" id="keys">
            <p className="eyebrow">NEW API KEY</p>
            <h2>Copy your key now</h2>
            <p>
              It is shown only once. Keep it private and store it in a
              server-side secret manager.
            </p>
            <code>{key}</code>
            <button
              className="outline"
              onClick={() => void navigator.clipboard.writeText(key)}
            >
              Copy API key
            </button>
            <button className="text" onClick={() => setKey("")}>
              Dismiss
            </button>
          </section>
        )}
        <section className="card help">
          <div>
            <p className="eyebrow">GET STARTED</p>
            <h2>Send your first message</h2>
            <p>
              Use your key from a trusted server. Never put it in browser
              JavaScript.
            </p>
          </div>
          <pre>{`curl -X POST "$PUBLIC_BASE_URL/api/v1/messages/send" -H "Authorization: Bearer $PUFFX_API_KEY" -H "Content-Type: application/json" -d '{"sessionId":"SESSION_ID","to":"919876543210","type":"text","message":"Hello!"}'`}</pre>
        </section>
        <footer>
          Unofficial WhatsApp Web integration. Review the security and
          compatibility notes before production use.
        </footer>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
