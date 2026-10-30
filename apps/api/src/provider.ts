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
  private stopping = false;
  constructor(
    private readonly root = process.env.WHATSAPP_AUTH_DIR ?? "./data/whatsapp",
  ) {}
  async connect(id: string, onEvent: (event: ProviderEvent) => void) {
    if (this.connecting.has(id) || this.sockets.has(id)) return;
    this.connecting.add(id);
    const dir = path.resolve(this.root, id);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const { state, saveCreds } = await useMultiFileAuthState(dir);
    const sock = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      browser: ["Puffx Gateway", "Chrome", "1.0"],
    });
    this.sockets.set(id, sock);
    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", (u) => {
      if (u.qr) onEvent({ type: "qr", qr: u.qr });
      if (u.connection === "open") {
        this.connecting.delete(id);
        onEvent({
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
        onEvent({
          type: "status",
          status:
            code === DisconnectReason.loggedOut ? "logged_out" : "disconnected",
        });
        if (!this.stopping && code !== DisconnectReason.loggedOut)
          setTimeout(() => void this.connect(id, onEvent), 3000).unref();
      }
    });
  }
  async requestPairingCode(id: string, phone: string) {
    await this.connect(id, () => {});
    const sock = this.sockets.get(id);
    if (!sock) throw new Error("Provider is still initializing; retry shortly");
    return sock.requestPairingCode(phone);
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
  }
  async closeAll() {
    this.stopping = true;
    await Promise.all(
      [...this.sockets.values()].map(async (sock) => sock.end(undefined)),
    );
    this.sockets.clear();
    this.connecting.clear();
  }
}
