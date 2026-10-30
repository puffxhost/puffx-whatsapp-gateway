import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
type Session = {
  id: string;
  name: string;
  status: string;
  phone?: string;
  last_error?: string | null;
  created_at: string;
};
type Message = {
  id: string;
  session_id: string;
  to_number: string;
  status: string;
  error_code?: string | null;
  created_at: string;
};
type Overview = {
  sessions_total: string;
  sessions_connected: string;
  messages_sent: string;
  messages_failed: string;
};
type Health = {
  database: string;
  whatsapp: {
    status: string;
    connectedSessions: number;
    activeSockets: number;
  };
};
type PairEvent = {
  sessionId: string;
  status: string;
  phone?: string;
  error?: string;
  qrCodeDataUrl?: string;
};

function App() {
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">(
    () => (localStorage.getItem("puffx-theme") as "dark" | "light") || "dark",
  );
  const [ready, setReady] = useState(false);
  const [modal, setModal] = useState<"pair" | "add" | null>(null);
  const [pairSession, setPairSession] = useState<Session | null>(null);
  const [pairMode, setPairMode] = useState<"qr" | "phone">("qr");
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [seconds, setSeconds] = useState(60);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState("");
  const call = async (url: string, body?: unknown, method = "GET") => {
    const response = await fetch("/api/v1" + url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = response.status === 204 ? {} : await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Request failed");
    return data;
  };
  const refresh = async () => {
    const [s, m, o, h] = await Promise.all([
      call("/sessions"),
      call("/messages?limit=8"),
      call("/overview"),
      call("/ready"),
    ]);
    setSessions(s.sessions);
    setMessages(m.messages);
    setOverview(o.overview);
    setHealth(h.checks);
  };
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("puffx-theme", theme);
  }, [theme]);
  useEffect(() => {
    let active = true;
    void call("/auth/me")
      .then(async (x) => {
        if (active) {
          setUser(x.user);
          await refresh();
        }
      })
      .catch(() => setUser(null))
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!user) return;
    const source = new EventSource("/api/v1/sessions/events", {
      withCredentials: true,
    });
    source.addEventListener("session", (raw) => {
      const update = JSON.parse(
        (raw as MessageEvent<string>).data,
      ) as PairEvent;
      setSessions((old) => {
        const next = old.map((s) =>
          s.id === update.sessionId
            ? {
                ...s,
                status: update.status,
                phone: update.phone ?? s.phone,
                last_error: update.error ?? null,
              }
            : s,
        );
        setOverview((current) =>
          current
            ? {
                ...current,
                sessions_connected: String(
                  next.filter((s) => s.status === "connected").length,
                ),
              }
            : current,
        );
        return next;
      });
      setPairSession((current) =>
        current?.id === update.sessionId
          ? {
              ...current,
              status: update.status,
              phone: update.phone ?? current.phone,
              last_error: update.error ?? null,
            }
          : current,
      );
      if (pairSession?.id === update.sessionId) {
        if (update.qrCodeDataUrl) {
          setQr(update.qrCodeDataUrl);
          setSeconds(60);
        }
        if (update.status === "connected") {
          setQr("");
          setCode("");
          setToast("WhatsApp connected");
          void refresh();
        }
        if (update.error) setError(update.error);
      }
    });
    return () => source.close();
  }, [user, pairSession?.id]);
  useEffect(() => {
    if (!modal || pairMode !== "qr" || !qr) return;
    const id = window.setInterval(
      () => setSeconds((v) => Math.max(0, v - 1)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [modal, pairMode, qr]);
  useEffect(() => {
    if (!modal || pairMode !== "phone" || !code) return;
    const id = window.setInterval(
      () => setSeconds((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [modal, pairMode, code]);
  useEffect(() => {
    if (
      modal === "pair" &&
      pairMode === "qr" &&
      qr &&
      seconds === 0 &&
      pairSession
    ) {
      setQr("");
      void startQr(pairSession.id);
    }
  }, [seconds, modal, pairMode, qr, pairSession]);
  useEffect(() => {
    if (modal === "pair" && pairMode === "phone" && code && seconds === 0) {
      setCode("");
      setError("Pairing code expired. Request a fresh code to continue.");
    }
  }, [seconds, modal, pairMode, code]);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (!modal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal]);
  const login = async (register = false) => {
    setError("");
    setBusy("auth");
    try {
      const x = await call(
        "/auth/" + (register ? "register" : "login"),
        { email, password },
        "POST",
      );
      setUser(x.user);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy("");
    }
  };
  const startQr = async (id: string) => {
    try {
      const x = await call("/sessions/" + id + "/pairing/qr", {}, "POST");
      if (x.qrCodeDataUrl) setQr(x.qrCodeDataUrl);
      setSeconds(60);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start pairing");
    }
  };
  const openPair = (s: Session) => {
    setPairSession(s);
    setModal("pair");
    setPairMode("qr");
    setQr("");
    setCode("");
    setPhone("");
    setError("");
    setSeconds(60);
    void startQr(s.id);
  };
  const requestCode = async () => {
    if (!pairSession || !phone.trim()) return;
    setBusy("pair");
    setError("");
    try {
      const x = await call(
        "/sessions/" + pairSession.id + "/pairing/phone",
        { phone: phone.trim() },
        "POST",
      );
      setCode(x.pairingCode);
      setSeconds(x.expiresInSeconds || 60);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not request pairing code",
      );
    } finally {
      setBusy("");
    }
  };
  const addSession = async () => {
    if (!name.trim()) return;
    setBusy("add");
    try {
      await call("/sessions", { name: name.trim() }, "POST");
      await refresh();
      setModal(null);
      setName("");
      setToast("Session added");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create session");
    } finally {
      setBusy("");
    }
  };
  const action = async (
    s: Session,
    kind: "reconnect" | "logout" | "delete",
  ) => {
    if (
      kind !== "reconnect" &&
      !window.confirm(
        kind === "logout"
          ? "Log out " + s.name + " from WhatsApp?"
          : "Delete " + s.name + " and its saved login?",
      )
    )
      return;
    try {
      await call(
        "/sessions/" + s.id + (kind === "delete" ? "" : "/" + kind),
        kind === "delete" ? undefined : {},
        kind === "delete" ? "DELETE" : "POST",
      );
      await refresh();
      setToast(
        kind === "delete"
          ? "Session deleted"
          : kind === "logout"
            ? "Session logged out"
            : "Reconnecting",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  };
  const createKey = async (s: Session) => {
    try {
      const x = await call(
        "/api-keys",
        { name: s.name + " dashboard key", sessionId: s.id },
        "POST",
      );
      setApiKey(x.secret);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create API key");
    }
  };
  const retry = async (m: Message) => {
    setBusy(m.id);
    try {
      await call("/messages/" + m.id + "/retry", {}, "POST");
      await refresh();
      setToast("Message sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setBusy("");
    }
  };
  const signOut = async () => {
    await call("/auth/logout", {}, "POST");
    setUser(null);
    setSessions([]);
  };
  if (!ready)
    return (
      <main className="loading-screen">
        <span className="brand-mark">P</span>
        <span>Loading workspace…</span>
      </main>
    );
  if (!user)
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="brand-mark">P</div>
          <p className="eyebrow">PUFFX GATEWAY</p>
          <h1>
            Your WhatsApp,
            <br />
            connected.
          </h1>
          <p className="muted">
            Manage WhatsApp sessions and messaging API in one place.
          </p>
          <label>
            Email address
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 12 characters"
            />
          </label>
          {error && (
            <div className="notice error-notice" role="alert">
              {error}
            </div>
          )}
          <button
            className="button primary full"
            disabled={busy === "auth"}
            onClick={() => void login()}
          >
            {busy === "auth" ? "Please wait…" : "Sign in"}
          </button>
          <button
            className="button ghost full"
            onClick={() => void login(true)}
          >
            Create an account
          </button>
          <p className="auth-foot">
            Your private, self-hosted messaging workspace.
          </p>
        </section>
      </main>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#">
          <span className="brand-mark">P</span>
          <span>
            puffx <small>GATEWAY</small>
          </span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          <a className="nav-link selected" href="#overview">
            <span>⌂</span> Overview
          </a>
          <a className="nav-link" href="#sessions">
            <span>◉</span> WhatsApp sessions
          </a>
          <a className="nav-link" href="#messages">
            <span>↗</span> Message history
          </a>
          <a className="nav-link" href="#api">
            <span>⌘</span> API access
          </a>
        </nav>
        <div className="sidebar-bottom">
          <div className="gateway-state">
            <i className="live-dot"></i>Gateway online
          </div>
          <a className="docs-link" href="/docs/openapi.yaml">
            API documentation ↗
          </a>
        </div>
      </aside>
      <main className="main-content" id="overview">
        <header className="topbar">
          <div className="crumb">
            Workspace <span>/</span> Overview
          </div>
          <div className="top-actions">
            <button
              className="icon-button"
              aria-label="Refresh data"
              onClick={() => void refresh()}
            >
              ↻
            </button>
            <button
              className="icon-button"
              aria-label="Toggle color theme"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? "☼" : "☾"}
            </button>
            <div className="user-chip">
              <span className="avatar">{user.email[0].toUpperCase()}</span>
              <span className="user-email">{user.email}</span>
            </div>
            <button
              className="button ghost signout"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>
        </header>
        {error && (
          <div className="notice error-notice wide-notice" role="alert">
            <span>{error}</span>
            <button aria-label="Dismiss" onClick={() => setError("")}>
              ×
            </button>
          </div>
        )}
        <section className="welcome-row">
          <div>
            <p className="eyebrow">YOUR MESSAGING WORKSPACE</p>
            <h1>
              Good to see you<span className="accent">.</span>
            </h1>
            <p className="muted">Here’s what’s happening with your gateway.</p>
          </div>
          <button
            className="button primary"
            onClick={() => {
              setError("");
              setModal("add");
            }}
          >
            ＋ Add WhatsApp
          </button>
        </section>
        <section className="stats-grid" aria-label="Workspace overview">
          <article className="stat-card">
            <div className="stat-top">
              <span>Total sessions</span>
              <span className="stat-icon violet">◉</span>
            </div>
            <strong>{overview?.sessions_total ?? "—"}</strong>
            <small>WhatsApp accounts</small>
          </article>
          <article className="stat-card">
            <div className="stat-top">
              <span>Connected</span>
              <span className="stat-icon green">✓</span>
            </div>
            <strong>{overview?.sessions_connected ?? "—"}</strong>
            <small>Ready to send</small>
          </article>
          <article className="stat-card">
            <div className="stat-top">
              <span>Messages sent</span>
              <span className="stat-icon blue">↗</span>
            </div>
            <strong>{overview?.messages_sent ?? "—"}</strong>
            <small>Accepted by WhatsApp</small>
          </article>
          <article className="stat-card">
            <div className="stat-top">
              <span>Failed messages</span>
              <span className="stat-icon orange">!</span>
            </div>
            <strong>{overview?.messages_failed ?? "—"}</strong>
            <small>Can be retried</small>
          </article>
        </section>
        <section className="health-strip" aria-label="Gateway checks">
          <span>
            <i className="health-ok"></i>Database{" "}
            <strong>{health?.database === "ok" ? "Ready" : "Checking"}</strong>
          </span>
          <span>
            <i
              className={
                health?.whatsapp.connectedSessions ? "health-ok" : "health-idle"
              }
            ></i>
            WhatsApp transport{" "}
            <strong>
              {health?.whatsapp.connectedSessions
                ? "Connected"
                : "Waiting for a session"}
            </strong>
          </span>
        </section>
        <section className="section-block" id="sessions">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ACCOUNTS</p>
              <h2>WhatsApp sessions</h2>
              <p className="muted">Pair a device and manage its connection.</p>
            </div>
            <span className="live-label">
              <i></i> Live updates
            </span>
          </div>
          {sessions.length === 0 ? (
            <div className="empty-card">
              <div className="empty-illustration">◉</div>
              <h3>Start with a WhatsApp account</h3>
              <p>
                Create a session, then scan a QR code or link with your phone
                number.
              </p>
              <button
                className="button primary"
                onClick={() => setModal("add")}
              >
                ＋ Create your first session
              </button>
            </div>
          ) : (
            <div className="session-grid">
              {sessions.map((s) => (
                <article className="session-card" key={s.id}>
                  <div className="session-card-head">
                    <span className="wa-mark">◉</span>
                    <span className={"status-pill " + s.status}>
                      <i></i>
                      {statusLabel(s.status)}
                    </span>
                  </div>
                  <h3>{s.name}</h3>
                  <p className="phone-line">
                    {s.phone ? "+" + s.phone : "Not linked yet"}
                  </p>
                  {s.last_error && (
                    <p className="session-error">{s.last_error}</p>
                  )}
                  <p className="session-date">
                    Added {new Date(s.created_at).toLocaleDateString()}
                  </p>
                  <div className="session-actions">
                    <button
                      className="button primary compact"
                      disabled={s.status === "connected"}
                      onClick={() => openPair(s)}
                    >
                      {s.status === "connected"
                        ? "Linked to WhatsApp"
                        : "Connect WhatsApp"}
                    </button>
                    <button
                      className="button outline compact"
                      disabled={busy === s.id || s.status === "connected"}
                      onClick={() => void action(s, "reconnect")}
                    >
                      {s.status === "connected" ? "Connected" : "↻ Reconnect"}
                    </button>
                  </div>
                  <div className="session-secondary">
                    <button onClick={() => void createKey(s)}>
                      Create API key
                    </button>
                    <button onClick={() => void action(s, "logout")}>
                      Log out
                    </button>
                    <button
                      className="danger-text"
                      onClick={() => void action(s, "delete")}
                    >
                      Delete
                    </button>
                  </div>
                  <div className="session-id">
                    <code>{s.id}</code>
                    <button
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(s.id)
                          .then(() => setToast("Session ID copied"))
                      }
                    >
                      Copy ID
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        <section className="section-block" id="messages">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ACTIVITY</p>
              <h2>Recent messages</h2>
              <p className="muted">Review recent sends and retry failures.</p>
            </div>
          </div>
          <div className="table-card">
            {messages.length === 0 ? (
              <div className="table-empty">
                Your message history will appear here.
              </div>
            ) : (
              messages.map((m) => (
                <div className="message-row" key={m.id}>
                  <span className={"message-icon " + m.status}>
                    {m.status === "sent" ? "↗" : "!"}
                  </span>
                  <div className="message-info">
                    <strong>To +{m.to_number}</strong>
                    <small>{new Date(m.created_at).toLocaleString()}</small>
                  </div>
                  <span className={"message-status " + m.status}>
                    {m.status}
                  </span>
                  {m.status === "failed" && (
                    <button
                      className="button outline compact"
                      disabled={busy === m.id}
                      onClick={() => void retry(m)}
                    >
                      {busy === m.id ? "Retrying…" : "Retry"}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
        <section className="section-block" id="api">
          <div className="section-heading">
            <div>
              <p className="eyebrow">DEVELOPERS</p>
              <h2>Connect your app</h2>
              <p className="muted">
                Use your API key on a trusted backend to send messages.
              </p>
            </div>
          </div>
          <div className="api-card">
            <div>
              <span className="api-chip">REST API</span>
              <h3>Your own infrastructure, one endpoint.</h3>
              <p>
                Keep API keys on your server and send through a connected
                session.
              </p>
              <a className="text-link" href="/docs/openapi.yaml">
                Read API reference ↗
              </a>
            </div>
            <pre>
              <code>
                {
                  'curl -X POST "$PUFFX_BASE_URL/api/v1/messages/send" \\\n  -H "Authorization: Bearer $PUFFX_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"sessionId":"SESSION_ID","to":"919876543210","type":"text","message":"Hello!"}\''
                }
              </code>
            </pre>
          </div>
        </section>
        <footer className="page-footer">
          Unofficial WhatsApp Web integration · Your session data stays on your
          server.
        </footer>
      </main>
      {modal === "add" && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className="dialog small-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-title"
          >
            <button
              className="modal-close"
              aria-label="Close"
              onClick={() => setModal(null)}
            >
              ×
            </button>
            <p className="eyebrow">NEW ACCOUNT</p>
            <h2 id="add-title">Add a session</h2>
            <p className="muted">
              Give this WhatsApp account a name you’ll recognize.
            </p>
            <label>
              Session name
              <input
                autoFocus
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addSession();
                }}
                placeholder="e.g. Support team"
              />
            </label>
            {error && <div className="notice error-notice">{error}</div>}
            <button
              className="button primary full"
              disabled={busy === "add" || !name.trim()}
              onClick={() => void addSession()}
            >
              {busy === "add" ? "Creating…" : "Create session"}
            </button>
          </section>
        </div>
      )}
      {modal === "pair" && pairSession && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className="dialog pairing-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pair-title"
          >
            <button
              className="modal-close"
              aria-label="Close pairing dialog"
              onClick={() => setModal(null)}
            >
              ×
            </button>
            <div className="pairing-title">
              <span className="wa-mark">◉</span>
              <div>
                <p className="eyebrow">LINK A DEVICE</p>
                <h2 id="pair-title">{pairSession.name}</h2>
              </div>
            </div>
            <div className="pairing-tabs" role="tablist">
              <button
                role="tab"
                aria-selected={pairMode === "qr"}
                className={pairMode === "qr" ? "active" : ""}
                onClick={() => {
                  setPairMode("qr");
                  setCode("");
                  if (!qr) void startQr(pairSession.id);
                }}
              >
                Scan QR code
              </button>
              <button
                role="tab"
                aria-selected={pairMode === "phone"}
                className={pairMode === "phone" ? "active" : ""}
                onClick={() => {
                  setPairMode("phone");
                  setQr("");
                  setError("");
                }}
              >
                Use phone number
              </button>
            </div>
            {error && (
              <div className="notice error-notice" role="alert">
                <span>{error}</span>
                <button onClick={() => setError("")}>×</button>
              </div>
            )}
            {pairMode === "qr" ? (
              <div className="qr-layout">
                <div className="qr-frame">
                  {qr ? (
                    <img src={qr} alt="WhatsApp device linking QR code" />
                  ) : (
                    <div className="qr-loading">
                      <span className="spinner"></span>
                      <strong>Preparing your QR code…</strong>
                      <small>Connecting securely to WhatsApp</small>
                    </div>
                  )}
                </div>
                <div className="pair-instructions">
                  <span className="step-number">1</span>
                  <p>Open WhatsApp on your phone</p>
                  <span className="step-number">2</span>
                  <p>
                    Go to <strong>Linked devices</strong> in Settings
                  </p>
                  <span className="step-number">3</span>
                  <p>
                    Tap <strong>Link a device</strong> and scan this code
                  </p>
                  <div className="qr-expiry">
                    {qr ? (
                      <>
                        Refreshes in <strong>{seconds}s</strong>
                      </>
                    ) : (
                      "Waiting for a fresh QR code…"
                    )}
                  </div>
                  <button
                    className="button outline full"
                    onClick={() => {
                      setQr("");
                      setSeconds(60);
                      void startQr(pairSession.id);
                    }}
                  >
                    ↻ Get a new QR code
                  </button>
                </div>
              </div>
            ) : (
              <div className="phone-pair">
                <p className="muted">
                  Enter your number with country code. We’ll show a one-time
                  code to enter in WhatsApp.
                </p>
                <label>
                  Phone number
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                  />
                </label>
                {code ? (
                  <div className="pairing-code-box">
                    <span>YOUR LINKING CODE</span>
                    <strong>{code}</strong>
                    <small>Expires in {seconds}s</small>
                    <button
                      className="button outline"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(code)
                          .then(() => setToast("Pairing code copied"))
                      }
                    >
                      Copy code
                    </button>
                    <small>
                      WhatsApp → Linked devices → Link with phone number instead
                    </small>
                  </div>
                ) : (
                  <button
                    className="button primary full"
                    disabled={busy === "pair" || phone.trim().length < 8}
                    onClick={() => void requestCode()}
                  >
                    {busy === "pair"
                      ? "Getting your code…"
                      : "Get pairing code"}
                  </button>
                )}
              </div>
            )}
            <div className="pairing-footer">
              <span className={"status-pill " + pairSession.status}>
                <i></i>
                {statusLabel(pairSession.status)}
              </span>
              <span>Keep your QR and code private.</span>
            </div>
          </section>
        </div>
      )}
      {apiKey && (
        <div className="modal-backdrop">
          <section
            className="dialog small-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="key-title"
          >
            <button
              className="modal-close"
              aria-label="Close"
              onClick={() => setApiKey("")}
            >
              ×
            </button>
            <p className="eyebrow">API KEY CREATED</p>
            <h2 id="key-title">Copy and store it safely</h2>
            <p className="muted">
              Shown once. Keep it on your backend, never in browser code.
            </p>
            <code className="secret-key">{apiKey}</code>
            <button
              className="button primary full"
              onClick={() =>
                void navigator.clipboard
                  .writeText(apiKey)
                  .then(() => setToast("API key copied"))
              }
            >
              Copy API key
            </button>
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>✓</span>
          {toast}
        </div>
      )}
    </div>
  );
}
function statusLabel(status: string) {
  const labels: Record<string, string> = {
    connected: "Connected",
    connecting: "Connecting",
    qr: "QR ready",
    disconnected: "Reconnecting",
    logged_out: "Login expired",
    failed: "Needs attention",
  };
  return labels[status] || "Not connected";
}
createRoot(document.getElementById("root")!).render(<App />);

