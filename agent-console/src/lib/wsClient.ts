/**
 * wsClient.ts — WebSocket manager class.
 *
 * Manages connection lifecycle, reconnection with exponential backoff,
 * seq ordering via SeqBuffer, deduplication, and dispatches typed messages
 * to the Zustand store.
 *
 * ── Protocol design notes ───────────────────────────────────────────────────
 *
 * 1. Per-turn seq reset (`beginTurn`)
 *    The server resets its `seq` counter to 0 on every USER_MESSAGE and clears
 *    its replay history. The client therefore resets its own seq-tracking state
 *    (buffer, processed set, rendered/received markers) at the start of each
 *    turn — otherwise the 2nd+ response, which restarts at seq 1, would be
 *    silently discarded as "already seen". This reset must NOT happen on a
 *    reconnect, where the server keeps numbering within the same turn.
 *
 * 2. Out-of-band control responses (PONG / TOOL_ACK)
 *    PING and TOOL_CALL carry hard deadlines (3s for PONG, 5s for TOOL_ACK).
 *    In chaos mode messages can arrive out of order, so a control message may
 *    sit behind a gap in the ordering buffer. We therefore answer PING and
 *    TOOL_CALL the instant they arrive on the wire — before buffering — and
 *    dedup by seq / call_id so duplicate deliveries never produce a second
 *    (and thus "unexpected") response. Ordered rendering still flows through
 *    the buffer.
 */

import { SeqBuffer } from './seqBuffer';
import { WSStateMachine } from './wsStateMachine';
import { metrics } from './metricsTracker';
import { parseUnsafe } from '@/src/types/unsafe';
import type {
  ServerMessage,
  ClientMessage,
  TokenMessage,
  ToolCallMessage,
  ToolResultMessage,
  ContextSnapshotMessage,
  PingMessage,
  StreamEndMessage,
  ErrorMessage,
} from '@/src/types';

// ─── Type Guards ──────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function hasType(v: unknown): v is { type: string; seq: number } {
  return isRecord(v) && typeof v['type'] === 'string' && typeof v['seq'] === 'number';
}

function isServerMessage(v: unknown): v is ServerMessage {
  if (!hasType(v)) return false;
  const types = [
    'TOKEN', 'TOOL_CALL', 'TOOL_RESULT', 'CONTEXT_SNAPSHOT',
    'PING', 'STREAM_END', 'ERROR',
  ];
  return types.includes(v.type);
}

// ─── Handler Types ────────────────────────────────────────────────────────────

export type MessageHandler = (msg: ServerMessage) => void;
export type StateChangeHandler = (state: string) => void;

/** Protocol frames the client emits, surfaced to the trace timeline. */
export interface ClientFrameNote {
  kind: 'PONG' | 'RESUME';
  seq: number;
  detail: string;
}
export type ClientFrameHandler = (note: ClientFrameNote) => void;

// ─── WSClient ─────────────────────────────────────────────────────────────────

export class WSClient {
  private socket: WebSocket | null = null;
  private url: string = '';

  // Seq tracking — lastRenderedSeq is what gets sent in RESUME (not lastReceivedSeq)
  private lastRenderedSeq: number = 0;
  private lastReceivedSeq: number = 0;
  private processedSeqs: Set<number> = new Set();

  // Out-of-band control dedup — guarantees exactly one PONG per PING seq and
  // one TOOL_ACK per call_id, even under duplicate delivery / replay.
  private respondedPingSeqs: Set<number> = new Set();
  private ackedCallIds: Set<string> = new Set();

  // Reconnection
  private backoffMs: number = 500;
  private readonly maxBackoffMs: number = 10_000;
  private backoffTimer: ReturnType<typeof setTimeout> | null = null;

  // Buffer + state machine
  private seqBuffer: SeqBuffer = new SeqBuffer();
  private stateMachine: WSStateMachine = new WSStateMachine();

  // Rapid tool call detection (UI/metrics only)
  private pendingToolCalls: Set<string> = new Set();

  // Callbacks
  onMessage: MessageHandler;
  onStateChange: StateChangeHandler;
  onClientFrame: ClientFrameHandler | null;

  constructor(
    onMessage: MessageHandler,
    onStateChange: StateChangeHandler,
    onClientFrame: ClientFrameHandler | null = null
  ) {
    this.onMessage = onMessage;
    this.onStateChange = onStateChange;
    this.onClientFrame = onClientFrame;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  connect(url: string): void {
    this.url = url;
    if (
      this.stateMachine.state !== 'IDLE' &&
      this.stateMachine.state !== 'CLOSED'
    ) {
      return;
    }
    this.stateMachine.send('USER_CONNECT');
    this.onStateChange(this.stateMachine.state);
    this.openSocket();
  }

  disconnect(): void {
    this.clearBackoffTimer();
    this.stateMachine.send('MANUAL_DISCONNECT');
    this.onStateChange(this.stateMachine.state);
    if (this.socket) {
      this.socket.close(1000, 'Manual disconnect');
      this.socket = null;
    }
  }

  send(msg: ClientMessage): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  /**
   * Reset per-turn seq state. Call immediately BEFORE sending a USER_MESSAGE.
   *
   * The server restarts its seq counter at 0 and clears replay history for each
   * user turn, so the client must forget the previous turn's numbering or the
   * new response (seq 1, 2, 3…) would be rejected as duplicates. Connection-level
   * state (socket, backoff, state machine) is intentionally left untouched.
   */
  beginTurn(): void {
    this.seqBuffer = new SeqBuffer();
    this.processedSeqs.clear();
    this.respondedPingSeqs.clear();
    this.ackedCallIds.clear();
    this.pendingToolCalls.clear();
    this.lastReceivedSeq = 0;
    this.lastRenderedSeq = 0;
  }

  /**
   * Called by the store after a render cycle commits.
   * This is what gets sent in RESUME — not lastReceivedSeq.
   */
  setLastRenderedSeq(seq: number): void {
    // Monotonic guard: a late render callback must never walk the marker
    // backwards, or a subsequent RESUME could ask the server to replay events
    // we already showed.
    if (seq > this.lastRenderedSeq) {
      this.lastRenderedSeq = seq;
    }
  }

  get currentState(): string {
    return this.stateMachine.state;
  }

  // ─── Socket Lifecycle ────────────────────────────────────────────────────────

  private openSocket(): void {
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
    }

    try {
      this.socket = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.socket.onopen = () => this.handleOpen();
    this.socket.onmessage = (event: MessageEvent) => this.handleRawMessage(event);
    this.socket.onclose = () => this.handleClose();
    this.socket.onerror = () => this.handleError();
  }

  private handleOpen(): void {
    // After a drop we must resume from where rendering left off, and RESUME has
    // to be the very first frame on the new socket so the server replays before
    // anything else. A fresh connection with nothing rendered yet just opens.
    const isReconnect =
      this.stateMachine.state === 'RECONNECTING' ||
      this.stateMachine.state === 'RESUMING';

    if (isReconnect || this.lastRenderedSeq > 0) {
      this.send({ type: 'RESUME', last_seq: this.lastRenderedSeq });
      this.onClientFrame?.({
        kind: 'RESUME',
        seq: this.lastRenderedSeq,
        detail: `last_seq=${this.lastRenderedSeq}`,
      });
      this.stateMachine.send('SOCKET_REOPENED');
    } else {
      this.stateMachine.send('SOCKET_OPEN');
    }

    this.resetBackoff();
    this.onStateChange(this.stateMachine.state);
  }

  private handleRawMessage(event: MessageEvent): void {
    let raw: unknown;
    try {
      raw = parseUnsafe(event.data as string);
    } catch {
      return;
    }

    if (!isServerMessage(raw)) {
      return;
    }

    // ── Protocol-critical control responses, answered out-of-band ──
    // Answered on raw receipt (not after ordered draining) so chaos-mode
    // reordering can never push us past the PONG/TOOL_ACK deadline.
    this.respondControl(raw);

    this.lastReceivedSeq = Math.max(this.lastReceivedSeq, raw.seq);

    // Push through seq buffer for reordering / dedup
    const prevNext = this.seqBuffer.getNextExpected();
    const ready = this.seqBuffer.push(raw);

    // Track reorders: if we got a msg with seq > nextExpected before filling gap
    if (raw.seq > prevNext && ready.length === 0) {
      metrics.recordReorder();
    }

    for (const msg of ready) {
      // Dedup via processedSeqs Set (handles cross-reconnect replays)
      if (this.processedSeqs.has(msg.seq)) {
        metrics.recordDuplicate(msg.seq);
        continue;
      }
      this.processedSeqs.add(msg.seq);
      this.dispatchMessage(msg);
    }

    // If we were RESUMING and just processed our first new message, transition to CONNECTED
    if (this.stateMachine.state === 'RESUMING' && ready.length > 0) {
      this.stateMachine.send('RESUME_SENT_AND_ACKED');
      this.onStateChange(this.stateMachine.state);
    }
  }

  /**
   * Answer PING and TOOL_CALL the moment they arrive on the wire, deduped so a
   * duplicate delivery or post-reconnect replay never triggers a second
   * response (which the server would log as "unexpected").
   */
  private respondControl(msg: ServerMessage): void {
    if (msg.type === 'PING') {
      if (this.respondedPingSeqs.has(msg.seq)) return;
      this.respondedPingSeqs.add(msg.seq);
      // Echo the challenge verbatim — including the empty-string chaos variant.
      const challenge = typeof msg.challenge === 'string' ? msg.challenge : '';
      metrics.recordPing(challenge);
      this.send({ type: 'PONG', echo: challenge });
      metrics.recordPong(challenge);
      this.onClientFrame?.({
        kind: 'PONG',
        seq: msg.seq,
        detail: challenge ? `echo "${challenge}"` : 'echo "" (corrupt PING)',
      });
    } else if (msg.type === 'TOOL_CALL') {
      if (this.ackedCallIds.has(msg.call_id)) return;
      this.ackedCallIds.add(msg.call_id);
      metrics.recordToolCallReceived(msg.call_id);
      this.send({ type: 'TOOL_ACK', call_id: msg.call_id });
      metrics.recordToolAckSent(msg.call_id);
    }
  }

  private handleClose(): void {
    if (this.stateMachine.state !== 'CLOSED') {
      metrics.recordDrop();
      // Show reconnecting indicator synchronously — within 500ms of drop
      this.stateMachine.send('CONNECTION_DROP');
      this.onStateChange(this.stateMachine.state);
      this.scheduleReconnect();
    }
  }

  private handleError(): void {
    // onerror always followed by onclose — let onclose handle state
  }

  // ─── Message Dispatch (ordered rendering) ──────────────────────────────────

  private dispatchMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'TOKEN':
        this.handleToken(msg);
        break;
      case 'TOOL_CALL':
        this.handleToolCall(msg);
        break;
      case 'TOOL_RESULT':
        this.handleToolResult(msg);
        break;
      case 'CONTEXT_SNAPSHOT':
        this.handleContextSnapshot(msg);
        break;
      case 'PING':
        this.handlePing(msg);
        break;
      case 'STREAM_END':
        this.handleStreamEnd(msg);
        break;
      case 'ERROR':
        this.handleServerError(msg);
        break;
    }
  }

  private handleToken(msg: TokenMessage): void {
    if (
      this.stateMachine.state === 'CONNECTED' ||
      this.stateMachine.state === 'RESUMING'
    ) {
      this.stateMachine.send('FIRST_TOKEN');
      this.onStateChange(this.stateMachine.state);
    }
    metrics.recordToken();
    this.onMessage(msg);
  }

  private handleToolCall(msg: ToolCallMessage): void {
    // ACK was already sent out-of-band in respondControl(); here we only drive
    // UI state and rapid-tool-call detection in ordered position.
    if (this.stateMachine.state === 'STREAMING') {
      this.stateMachine.send('TOOL_CALL_RECEIVED');
      this.onStateChange(this.stateMachine.state);
    }

    this.pendingToolCalls.add(msg.call_id);
    if (this.pendingToolCalls.size >= 2) {
      metrics.recordRapidToolCalls(this.pendingToolCalls.size);
    }

    this.onMessage(msg);
  }

  private handleToolResult(msg: ToolResultMessage): void {
    this.pendingToolCalls.delete(msg.call_id);

    if (this.stateMachine.state === 'TOOL_CALL_PENDING') {
      this.stateMachine.send('TOOL_RESULT_RECEIVED');
      this.onStateChange(this.stateMachine.state);
    }

    this.onMessage(msg);
  }

  private handleContextSnapshot(msg: ContextSnapshotMessage): void {
    // Detect large context payloads
    try {
      const size = JSON.stringify(msg.data).length;
      if (size > 500 * 1024) {
        metrics.recordLargeContext(size);
      }
    } catch { /* ignore */ }
    this.onMessage(msg);
  }

  private handlePing(msg: PingMessage): void {
    // PONG already sent out-of-band; ordered dispatch only renders the PING in
    // the timeline.
    this.onMessage(msg);
  }

  private handleStreamEnd(msg: StreamEndMessage): void {
    if (this.stateMachine.state === 'STREAMING') {
      this.stateMachine.send('STREAM_END');
      this.onStateChange(this.stateMachine.state);
    }
    this.onMessage(msg);
  }

  private handleServerError(msg: ErrorMessage): void {
    this.onMessage(msg);
  }

  // ─── Reconnection ────────────────────────────────────────────────────────────

  private scheduleReconnect(): void {
    this.clearBackoffTimer();

    this.backoffTimer = setTimeout(() => {
      this.backoffTimer = null;
      if (this.stateMachine.state === 'CLOSED') return;
      this.openSocket();
    }, this.backoffMs);

    // Exponential backoff: 500 → 1000 → 2000 → 4000 → 8000 → 10000 (cap)
    this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
  }

  private resetBackoff(): void {
    this.backoffMs = 500;
  }

  private clearBackoffTimer(): void {
    if (this.backoffTimer !== null) {
      clearTimeout(this.backoffTimer);
      this.backoffTimer = null;
    }
  }
}
