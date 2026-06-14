import http from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket, RawData } from "ws";
import { ServerMessage, ClientMessage, ClientLogEntry, ServerMode, ChaosConfig } from "./types.js";
import { selectScript } from "./scripts.js";
import { ChaosEngine, generateChaosConfig } from "./chaos.js";

export class AgentServer {
  private mode: ServerMode;
  private httpServer: http.Server;
  private wss: WebSocketServer;
  private activeWs: WebSocket | null = null;

  private seq: number = 0;
  private eventHistory: ServerMessage[] = [];
  private clientLog: ClientLogEntry[] = [];

  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private pendingPing: { challenge: string; sentAt: number } | null = null;
  private missedPongs: number = 0;
  private readonly HEARTBEAT_INTERVAL_MS = 12_000;
  private readonly PONG_TIMEOUT_MS = 3_000;
  private pongTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

  private pendingAcks: Map<string, { resolve: () => void; timeout: ReturnType<typeof setTimeout> }> = new Map();

  private isStreaming: boolean = false;
  private streamAbortController: AbortController | null = null;

  private chaosEngine: ChaosEngine | null = null;
  private chaosConfig: ChaosConfig | null = null;

  constructor(mode: ServerMode) {
    this.mode = mode;
    this.httpServer = http.createServer((req, res) => this.handleHttp(req, res));
    this.wss = new WebSocketServer({ server: this.httpServer, path: "/ws" });
    this.wss.on("connection", (ws) => this.handleConnection(ws));
  }

  listen(port: number): void {
    this.httpServer.listen(port, () => {
      console.log(`[agent-server] mode=${this.mode} port=${port}`);
      console.log(`[agent-server] WebSocket: ws://localhost:${port}/ws`);
      console.log(`[agent-server] Health:    http://localhost:${port}/health`);
      console.log(`[agent-server] Logs:      http://localhost:${port}/log`);
      console.log(`[agent-server] Reset:     http://localhost:${port}/reset`);
    });
  }

  private handleHttp(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ok", mode: this.mode,
        connected: this.activeWs !== null && this.activeWs.readyState === WebSocket.OPEN,
        seq: this.seq, historyLength: this.eventHistory.length,
      }));
      return;
    }

    if (req.url === "/log") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(this.clientLog, null, 2));
      return;
    }

    if (req.url === "/reset") {
      this.resetSession();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "reset" }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  }

  private handleConnection(ws: WebSocket): void {
    console.log("[agent-server] New WebSocket connection");
    if (this.activeWs && this.activeWs.readyState === WebSocket.OPEN) {
      console.log("[agent-server] Closing previous connection");
      this.activeWs.close(1000, "replaced");
    }
    this.stopHeartbeat();
    this.abortStream();
    this.activeWs = ws;
    this.missedPongs = 0;

    if (this.mode === "chaos") {
      this.chaosConfig = generateChaosConfig();
      this.chaosEngine = new ChaosEngine(this.chaosConfig);
      console.log("[agent-server] Chaos config:", JSON.stringify(this.chaosConfig));
    }

    ws.on("message", (data) => this.handleMessage(ws, data));
    ws.on("close", (code, reason) => {
      console.log(`[agent-server] Connection closed: ${code} ${reason.toString()}`);
      if (this.activeWs === ws) { this.stopHeartbeat(); this.activeWs = null; }
    });
    ws.on("error", (err) => console.error("[agent-server] WebSocket error:", err.message));

    setTimeout(() => {
      if (this.activeWs === ws && ws.readyState === WebSocket.OPEN) {
        this.startHeartbeat(ws);
      }
    }, 2000);
  }

  private handleMessage(ws: WebSocket, raw: RawData): void {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      this.logClient("PARSE_ERROR", { raw: raw.toString().slice(0, 200) }, "error");
      return;
    }

    switch (msg.type) {
      case "USER_MESSAGE":
        this.logClient("USER_MESSAGE", { content: msg.content }, "ok");
        this.handleUserMessage(ws, msg.content);
        break;
      case "PONG":
        this.handlePong(msg.echo);
        break;
      case "RESUME":
        this.logClient("RESUME", { last_seq: msg.last_seq }, "ok");
        this.handleResume(ws, msg.last_seq);
        break;
      case "TOOL_ACK":
        this.handleToolAck(msg.call_id);
        break;
      default:
        this.logClient("UNKNOWN_MESSAGE", { msg }, "error");
    }
  }

  private handleUserMessage(ws: WebSocket, content: string): void {
    this.abortStream();
    this.seq = 0;
    this.eventHistory = [];
    if (this.chaosEngine) this.chaosEngine.reset();

    const script = selectScript(content);
    console.log(`[agent-server] Script: ${script.name}`);
    this.runScript(ws, script).catch((err) => {
      if (err.name !== "AbortError") console.error("[agent-server] Script error:", err);
    });
  }

  private handleResume(ws: WebSocket, lastSeq: number): void {
    console.log(`[agent-server] Resume from seq=${lastSeq}, history=${this.eventHistory.length}`);
    const toReplay = this.eventHistory.filter((m) => m.seq > lastSeq);
    console.log(`[agent-server] Replaying ${toReplay.length} events`);
    for (const msg of toReplay) this.rawSend(ws, msg);
  }

  private handlePong(echo: string): void {
    if (!this.pendingPing) {
      this.logClient("PONG", { echo, expected: null }, "unexpected");
      return;
    }
    const latency = Date.now() - this.pendingPing.sentAt;
    if (echo === this.pendingPing.challenge) {
      this.logClient("PONG", { echo, latency_ms: latency }, "ok");
      this.missedPongs = 0;
    } else {
      this.logClient("PONG", { echo, expected: this.pendingPing.challenge, latency_ms: latency }, "wrong_challenge");
    }
    this.pendingPing = null;
    if (this.pongTimeoutHandle) { clearTimeout(this.pongTimeoutHandle); this.pongTimeoutHandle = null; }
  }

  private handleToolAck(callId: string): void {
    const pending = this.pendingAcks.get(callId);
    if (pending) {
      this.logClient("TOOL_ACK", { call_id: callId }, "ok");
      clearTimeout(pending.timeout);
      this.pendingAcks.delete(callId);
      pending.resolve();
    } else {
      this.logClient("TOOL_ACK", { call_id: callId }, "unexpected");
    }
  }

  private async runScript(ws: WebSocket, script: ReturnType<typeof selectScript>): Promise<void> {
    const streamId = `s_${randomUUID().slice(0, 8)}`;
    const abort = new AbortController();
    this.streamAbortController = abort;
    this.isStreaming = true;

    try {
      for (const event of script.events) {
        if (abort.signal.aborted) return;
        if (ws.readyState !== WebSocket.OPEN) return;

        if (event.kind === "context") {
          const msg: ServerMessage = {
            type: "CONTEXT_SNAPSHOT", seq: this.nextSeq(),
            context_id: event.context_id, data: event.data,
          };
          await this.sendMessage(ws, msg);
        } else if (event.kind === "token") {
          const msg: ServerMessage = {
            type: "TOKEN", seq: this.nextSeq(),
            text: event.text, stream_id: streamId,
          };
          await this.sendMessage(ws, msg);
          await this.delay(30 + Math.random() * 50, abort.signal);
        } else if (event.kind === "tool_call") {
          const callId = `tc_${randomUUID().slice(0, 8)}`;
          const callMsg: ServerMessage = {
            type: "TOOL_CALL", seq: this.nextSeq(),
            call_id: callId, tool_name: event.tool_name,
            args: event.args, stream_id: streamId,
          };
          await this.sendMessage(ws, callMsg);
          await this.waitForAck(callId);
          await this.delay(800 + Math.random() * 1200, abort.signal);
          if (abort.signal.aborted || ws.readyState !== WebSocket.OPEN) return;
          const resultMsg: ServerMessage = {
            type: "TOOL_RESULT", seq: this.nextSeq(),
            call_id: callId, result: event.result, stream_id: streamId,
          };
          await this.sendMessage(ws, resultMsg);
          await this.delay(200, abort.signal);
        }
      }

      if (!abort.signal.aborted && ws.readyState === WebSocket.OPEN) {
        if (this.chaosEngine) {
          const remaining = this.chaosEngine.flush();
          for (const msg of remaining) this.rawSend(ws, msg);
        }
        const endMsg: ServerMessage = { type: "STREAM_END", seq: this.nextSeq(), stream_id: streamId };
        await this.sendMessage(ws, endMsg);
      }
    } finally {
      this.isStreaming = false;
      this.streamAbortController = null;
    }
  }

  private async sendMessage(ws: WebSocket, message: ServerMessage): Promise<void> {
    if (ws.readyState !== WebSocket.OPEN) return;
    this.eventHistory.push(message);

    if (this.chaosEngine) {
      if (this.chaosEngine.shouldDropConnection()) {
        console.log("[chaos] Dropping connection");
        ws.terminate();
        return;
      }
      const { messages, delayMs } = this.chaosEngine.process(message);
      if (delayMs > 0) {
        console.log(`[chaos] Latency spike: ${Math.round(delayMs)}ms`);
        await new Promise<void>((r) => setTimeout(r, delayMs));
      }
      for (const msg of messages) this.rawSend(ws, msg);
    } else {
      this.rawSend(ws, message);
    }
  }

  private rawSend(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }

  private startHeartbeat(ws: WebSocket): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) { this.stopHeartbeat(); return; }

      if (this.pendingPing) {
        this.missedPongs++;
        this.logClient("PONG_TIMEOUT", { challenge: this.pendingPing.challenge, missed_count: this.missedPongs }, "violation");
        if (this.missedPongs >= 3) {
          console.log("[agent-server] 3 missed PONGs — terminating");
          ws.terminate(); this.stopHeartbeat(); return;
        }
      }

      let challenge = randomUUID().slice(0, 8);
      if (this.chaosEngine && this.chaosEngine.shouldCorruptPing()) {
        console.log("[chaos] Corrupt PING (empty challenge)");
        challenge = "";
      }

      const pingMsg: ServerMessage = { type: "PING", seq: this.nextSeq(), challenge };
      this.pendingPing = { challenge, sentAt: Date.now() };
      this.eventHistory.push(pingMsg);
      this.rawSend(ws, pingMsg);

      this.pongTimeoutHandle = setTimeout(() => {}, this.PONG_TIMEOUT_MS);
    }, this.HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) { clearInterval(this.heartbeatInterval); this.heartbeatInterval = null; }
    if (this.pongTimeoutHandle) { clearTimeout(this.pongTimeoutHandle); this.pongTimeoutHandle = null; }
    this.pendingPing = null;
  }

  private waitForAck(callId: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (this.pendingAcks.has(callId)) {
          console.log(`[agent-server] TOOL_ACK timeout for ${callId}`);
          this.logClient("TOOL_ACK_TIMEOUT", { call_id: callId }, "violation");
          this.pendingAcks.delete(callId);
          resolve();
        }
      }, 5000);
      this.pendingAcks.set(callId, { resolve, timeout });
    });
  }

  private nextSeq(): number { return ++this.seq; }

  private delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      if (signal) {
        const onAbort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
        if (signal.aborted) { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); return; }
        signal.addEventListener("abort", onAbort, { once: true });
      }
    });
  }

  private abortStream(): void {
    if (this.streamAbortController) { this.streamAbortController.abort(); this.streamAbortController = null; }
    this.isStreaming = false;
    for (const [, entry] of this.pendingAcks) { clearTimeout(entry.timeout); entry.resolve(); }
    this.pendingAcks.clear();
  }

  private resetSession(): void {
    this.abortStream(); this.stopHeartbeat();
    this.seq = 0; this.eventHistory = []; this.clientLog = []; this.missedPongs = 0;
    if (this.chaosEngine) this.chaosEngine.reset();
    console.log("[agent-server] Session reset");
  }

  private logClient(type: string, data: Record<string, unknown>, verdict: string): void {
    this.clientLog.push({ timestamp: Date.now(), type, data, verdict });
  }
}
