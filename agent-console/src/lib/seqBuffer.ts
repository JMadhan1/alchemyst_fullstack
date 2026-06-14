/**
 * seqBuffer.ts — Reorder + deduplicate buffer for WebSocket messages.
 *
 * The server guarantees monotonically increasing `seq` values but the
 * network may deliver them out of order. This buffer holds messages until
 * they can be emitted in order starting from `nextExpected`.
 */

import type { ServerMessage } from '@/src/types';

export class SeqBuffer {
  private buffer: Map<number, ServerMessage> = new Map();
  private nextExpected: number = 1;

  /**
   * Push a message into the buffer.
   * Returns an ordered array of messages that are now ready to process.
   * May return [] if the message was a duplicate or if we're still waiting
   * for earlier seq numbers.
   */
  push(msg: ServerMessage): ServerMessage[] {
    const { seq } = msg;

    // Duplicate: already processed or already buffered
    if (seq < this.nextExpected) {
      return [];
    }

    if (this.buffer.has(seq)) {
      // Exact duplicate in buffer — discard
      return [];
    }

    // Buffer this message
    this.buffer.set(seq, msg);

    // Drain consecutive messages from nextExpected
    return this.drain();
  }

  private drain(): ServerMessage[] {
    const ready: ServerMessage[] = [];

    while (this.buffer.has(this.nextExpected)) {
      const msg = this.buffer.get(this.nextExpected);
      if (msg !== undefined) {
        ready.push(msg);
        this.buffer.delete(this.nextExpected);
      }
      this.nextExpected++;
    }

    return ready;
  }

  /**
   * Reset the buffer after a RESUME. The server will replay from `fromSeq`,
   * so we set nextExpected to that value and clear buffered future messages
   * that are below fromSeq (they'll be replayed).
   */
  reset(fromSeq: number): void {
    this.nextExpected = fromSeq;
    // Remove any buffered entries below the new nextExpected
    for (const key of this.buffer.keys()) {
      if (key < fromSeq) {
        this.buffer.delete(key);
      }
    }
  }

  getNextExpected(): number {
    return this.nextExpected;
  }

  /** Size of pending (not-yet-drainable) buffer */
  get pendingCount(): number {
    return this.buffer.size;
  }
}
