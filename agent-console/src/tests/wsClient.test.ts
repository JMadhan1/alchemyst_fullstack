/**
 * wsClient.test.ts — Behavioural tests for the WSClient against a mock socket.
 *
 * Focus: the two protocol-critical guarantees that are easy to regress —
 *   1. per-turn seq reset (so the 2nd+ response, which restarts at seq 1,
 *      is rendered rather than discarded as a duplicate), and
 *   2. out-of-band, deduplicated PONG / TOOL_ACK responses.
 */

import { WSClient } from '../lib/wsClient';
import type { ServerMessage, ClientMessage } from '../types';

// ─── Mock WebSocket ─────────────────────────────────────────────────────────

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  static last: MockWebSocket | null = null;

  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = MockWebSocket.CONNECTING;
  sent: ClientMessage[] = [];
  url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.last = this;
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientMessage);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  // ── test helpers ──
  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  emit(msg: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

(globalThis as { WebSocket: unknown }).WebSocket = MockWebSocket;

function setup() {
  const received: ServerMessage[] = [];
  const client = new WSClient(
    (m) => received.push(m),
    () => {}
  );
  client.connect('ws://localhost:4747/ws');
  const sock = MockWebSocket.last!;
  sock.open();
  return { client, sock, received };
}

const sentOf = (sock: MockWebSocket, type: string) =>
  sock.sent.filter((m) => m.type === type);

// ─── Multi-turn seq reset ───────────────────────────────────────────────────

describe('WSClient — per-turn seq reset', () => {
  test('renders a second turn whose seq counter restarts at 1', () => {
    const { client, sock, received } = setup();

    // Turn 1: seq 1..2
    sock.emit({ type: 'TOKEN', seq: 1, text: 'first', stream_id: 's1' });
    sock.emit({ type: 'STREAM_END', seq: 2, stream_id: 's1' });
    expect(received.some((m) => m.type === 'TOKEN' && m.text === 'first')).toBe(true);

    // Turn 2: server reset its counter, restarts at seq 1
    client.beginTurn();
    sock.emit({ type: 'TOKEN', seq: 1, text: 'second', stream_id: 's2' });

    expect(received.some((m) => m.type === 'TOKEN' && m.text === 'second')).toBe(true);
  });

  test('WITHOUT beginTurn the restarted seq is (correctly) dropped as a dup', () => {
    // Demonstrates exactly what beginTurn prevents.
    const { sock, received } = setup();
    sock.emit({ type: 'TOKEN', seq: 1, text: 'first', stream_id: 's1' });
    sock.emit({ type: 'STREAM_END', seq: 2, stream_id: 's1' });

    received.length = 0;
    sock.emit({ type: 'TOKEN', seq: 1, text: 'second', stream_id: 's2' }); // no beginTurn
    expect(received.some((m) => m.type === 'TOKEN' && m.text === 'second')).toBe(false);
  });
});

// ─── Out-of-band control responses ──────────────────────────────────────────

describe('WSClient — PONG handling', () => {
  test('echoes the challenge immediately on PING', () => {
    const { sock } = setup();
    sock.emit({ type: 'PING', seq: 1, challenge: 'abc123' });
    const pongs = sentOf(sock, 'PONG');
    expect(pongs).toHaveLength(1);
    expect((pongs[0] as { echo: string }).echo).toBe('abc123');
  });

  test('echoes an empty-string challenge (chaos corrupt PING)', () => {
    const { sock } = setup();
    sock.emit({ type: 'PING', seq: 1, challenge: '' });
    const pongs = sentOf(sock, 'PONG');
    expect(pongs).toHaveLength(1);
    expect((pongs[0] as { echo: string }).echo).toBe('');
  });

  test('a duplicate PING (identical seq) yields exactly one PONG', () => {
    const { sock } = setup();
    sock.emit({ type: 'PING', seq: 7, challenge: 'dup' });
    sock.emit({ type: 'PING', seq: 7, challenge: 'dup' });
    expect(sentOf(sock, 'PONG')).toHaveLength(1);
  });

  test('responds even when the PING sits behind a gap (reordering)', () => {
    const { sock } = setup();
    // seq 1 is missing; PING arrives as seq 2 — must still PONG without waiting.
    sock.emit({ type: 'PING', seq: 2, challenge: 'ooo' });
    expect(sentOf(sock, 'PONG')).toHaveLength(1);
  });
});

describe('WSClient — TOOL_ACK handling', () => {
  const toolCall = (seq: number, call_id: string): ServerMessage => ({
    type: 'TOOL_CALL', seq, call_id, tool_name: 'search', args: {}, stream_id: 's1',
  });

  test('acks a tool call exactly once', () => {
    const { sock } = setup();
    sock.emit(toolCall(1, 'tc_1'));
    const acks = sentOf(sock, 'TOOL_ACK');
    expect(acks).toHaveLength(1);
    expect((acks[0] as { call_id: string }).call_id).toBe('tc_1');
  });

  test('a duplicate tool call (same call_id) is acked only once', () => {
    const { sock } = setup();
    sock.emit(toolCall(1, 'tc_dup'));
    sock.emit(toolCall(1, 'tc_dup'));
    expect(sentOf(sock, 'TOOL_ACK')).toHaveLength(1);
  });
});

// ─── Reconnect / RESUME ─────────────────────────────────────────────────────

describe('WSClient — RESUME on reconnect', () => {
  test('sends RESUME with last rendered seq as the first frame after a drop', () => {
    jest.useFakeTimers();
    try {
      const { client, sock } = setup();
      sock.emit({ type: 'TOKEN', seq: 1, text: 'hi', stream_id: 's1' });
      client.setLastRenderedSeq(1);

      sock.close(); // drop → RECONNECTING + scheduled reconnect (500ms backoff)
      jest.advanceTimersByTime(500);

      const newSock = MockWebSocket.last!;
      expect(newSock).not.toBe(sock);
      newSock.open();

      const first = newSock.sent[0] as { type: string; last_seq: number };
      expect(first.type).toBe('RESUME');
      expect(first.last_seq).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
