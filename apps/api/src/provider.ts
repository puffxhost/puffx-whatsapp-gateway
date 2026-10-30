import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

export type ProviderEvent =
  | { type: "qr"; qr: string }
  | {
      type: "status";
      status:
        "connecting" | "connected" | "disconnected" | "logged_out" | "failed";
      phone?: string;
      error?: string;
    };
export interface WhatsAppProvider {
  connect(
    sessionId: string,
    onEvent: (event: ProviderEvent) => void,
  ): Promise<void>;
  requestPairingCode(sessionId: string, phone: string): Promise<string>;
  sendText(
    sessionId: string,
    to: string,
    text: string,
  ): Promise<{ id: string }>;
  disconnect(sessionId: string, logout?: boolean): Promise<void>;
}

// Baileys adapter. Authentication files are private to this process and must live on a persistent, access-controlled volume.
export class BaileysProvider implements WhatsAppProvider {
  private sockets = new Map<string, WASocket>();
  private connecting = new Set<string>();
  private listeners = new Map<string, Set<(event: ProviderEvent) => void>>();
  private stopping = false;
  constructor(
    private readonly root = process.env.WHATSAPP_AUTH_DIR ?? "./data/whatsapp",
  ) {}
  async connect(id: string, onEvent: (event: ProviderEvent) => void) {
    const listeners = this.listeners.get(id) ?? new Set();
    listeners.add(onEvent);
    this.listeners.set(id, listeners);
    if (this.connecting.has(id) || this.sockets.has(id)) return;
    this.connecting.add(id);
    const dir = path.resolve(this.root, id);
    try {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const { state, saveCreds } = await useMultiFileAuthState(dir);
      const sock = makeWASocket({
        auth: state,
        logger: pino({ level: "silent" }),
        browser: ["Puffx Gateway", "Chrome", "1.0"],
      });
      this.sockets.set(id, sock);
      sock.ev.on("creds.update", saveCreds);
      sock.ev.on("connection.update", (u) => {
        if (u.qr) this.emit(id, { type: "qr", qr: u.qr });
        if (u.connection === "open") {
          this.connecting.delete(id);
          this.emit(id, {
            type: "status",
            status: "connected",
            phone: sock.user?.id.split(":")[0],
          });
        }
        if (u.connection === "close") {
          this.sockets.delete(id);
          this.connecting.delete(id);
          const code = (
            u.lastDisconnect?.error as { output?: { statusCode?: number } }
          )?.output?.statusCode;
          const error =
            code === DisconnectReason.loggedOut
              ? "WhatsApp login expired. Pair this account again."
              : code === 515
                ? "WhatsApp requested a connection restart. Reconnecting automatically."
                : "WhatsApp connection interrupted" +
                  (code ? " (code " + code + ")" : "") +
                  ". Check server network access and retry.";
          this.emit(id, {
            type: "status",
            status:
              code === DisconnectReason.loggedOut
                ? "logged_out"
                : "disconnected",
            error,
          });
          if (!this.stopping && code !== DisconnectReason.loggedOut)
            setTimeout(() => void this.connect(id, onEvent), 3000).unref();
        }
      });
    } catch (error) {
      this.connecting.delete(id);
      this.sockets.delete(id);
      throw error;
    }
  }
  async requestPairingCode(id: string, phone: string) {
    let sock = this.sockets.get(id);
    if (sock?.authState.creds.registered)
      throw new Error(
        "This WhatsApp session is already registered; reconnect it instead",
      );
    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.listeners.get(id)?.delete(onEvent);
        reject(
          new Error(
            "Timed out waiting for WhatsApp to become ready for pairing",
          ),
        );
      }, 30_000);
      const onEvent = (event: ProviderEvent) => {
        if (
          event.type === "status" &&
          ["failed", "logged_out", "disconnected"].includes(event.status)
        ) {
          clearTimeout(timeout);
          this.listeners.get(id)?.delete(onEvent);
          reject(
            new Error(
              "WhatsApp connection failed before pairing code was ready",
            ),
          );
          return;
        }
        if (event.type !== "qr") return;
        sock = this.sockets.get(id);
        if (!sock || sock.authState.creds.registered) return;
        clearTimeout(timeout);
        this.listeners.get(id)?.delete(onEvent);
        void sock.requestPairingCode(phone).then(resolve, reject);
      };
      void this.connect(id, onEvent).catch((error) => {
        clearTimeout(timeout);
        this.listeners.get(id)?.delete(onEvent);
        reject(error);
      });
    });
  }
  private emit(id: string, event: ProviderEvent) {
    for (const listener of this.listeners.get(id) ?? []) listener(event);
  }
  healthSummary() {
    const connectedSessions = [...this.sockets.values()].filter((socket) =>
      Boolean(socket.user),
    ).length;
    return {
      status: connectedSessions ? "connected" : "idle",
      connectedSessions,
      activeSockets: this.sockets.size,
    };
  }
  async sendText(id: string, to: string, text: string) {
    const sock = this.sockets.get(id);
    if (!sock || !sock.user) throw new Error("Session is not connected");
    const result = await sock.sendMessage(`${to}@s.whatsapp.net`, { text });
    if (!result?.key?.id)
      throw new Error("Provider did not confirm message acceptance");
    return { id: result.key.id };
  }
  async disconnect(id: string, logout = false) {
    const sock = this.sockets.get(id);
    if (sock) {
      if (logout) await sock.logout();
      else sock.end(undefined);
      this.sockets.delete(id);
    }
    if (logout)
      await rm(path.resolve(this.root, id), { recursive: true, force: true });
    if (logout) this.listeners.delete(id);
  }
  async closeAll() {
    this.stopping = true;
    await Promise.all(
      [...this.sockets.values()].map(async (sock) => sock.end(undefined)),
    );
    this.sockets.clear();
    this.connecting.clear();
    this.listeners.clear();
  }
}

