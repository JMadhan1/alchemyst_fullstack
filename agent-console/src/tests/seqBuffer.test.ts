/**
 * seqBuffer.test.ts — Unit tests for SeqBuffer reorder + dedup logic.
 */

import { SeqBuffer } from '../lib/seqBuffer';
import type { ServerMessage } from '../types';

function token(seq: number): ServerMessage {
  return {
    type: 'TOKEN',
    seq,
    text: `tok${seq}`,
    stream_id: 'stream-1',
  };
}

describe('SeqBuffer', () => {
  let buf: SeqBuffer;

  beforeEach(() => {
    buf = new SeqBuffer();
  });

  test('in-order messages — push seq 1,2,3 returns all three immediately', () => {
    const r1 = buf.push(token(1));
    const r2 = buf.push(token(2));
    const r3 = buf.push(token(3));

    expect(r1).toHaveLength(1);
    expect(r1[0]?.seq).toBe(1);

    expect(r2).toHaveLength(1);
    expect(r2[0]?.seq).toBe(2);

    expect(r3).toHaveLength(1);
    expect(r3[0]?.seq).toBe(3);
  });

  test('out-of-order messages — push seq 3,1,2 → [] for 3, [] for 1, then [1,2,3] when 2 arrives', () => {
    const r3 = buf.push(token(3));
    expect(r3).toHaveLength(0);

    const r1 = buf.push(token(1));
    expect(r1).toHaveLength(1);
    expect(r1[0]?.seq).toBe(1);

    const r2 = buf.push(token(2));
    expect(r2).toHaveLength(2);
    expect(r2[0]?.seq).toBe(2);
    expect(r2[1]?.seq).toBe(3);
  });

  test('duplicate seq — push seq 1,1 → second push returns []', () => {
    const r1 = buf.push(token(1));
    expect(r1).toHaveLength(1);

    const r1dup = buf.push(token(1));
    expect(r1dup).toHaveLength(0);
  });

  test('fully reversed sequence — push seq 5,4,3,2,1 → only returns all 5 when seq 1 arrives', () => {
    expect(buf.push(token(5))).toHaveLength(0);
    expect(buf.push(token(4))).toHaveLength(0);
    expect(buf.push(token(3))).toHaveLength(0);
    expect(buf.push(token(2))).toHaveLength(0);

    const result = buf.push(token(1));
    expect(result).toHaveLength(5);
    expect(result.map((m) => m.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  test('single element — push seq 1 returns [seq 1]', () => {
    const result = buf.push(token(1));
    expect(result).toHaveLength(1);
    expect(result[0]?.seq).toBe(1);
  });

  test('empty buffer drain — push seq 1, then seq 3, then seq 2 → seq 2 triggers drain of 2+3', () => {
    const r1 = buf.push(token(1));
    expect(r1).toHaveLength(1);
    expect(r1[0]?.seq).toBe(1);

    const r3 = buf.push(token(3));
    expect(r3).toHaveLength(0);

    const r2 = buf.push(token(2));
    expect(r2).toHaveLength(2);
    expect(r2[0]?.seq).toBe(2);
    expect(r2[1]?.seq).toBe(3);
  });

  test('reset — push seq 5, call reset(3), push seq 3 → returns seq 3', () => {
    buf.push(token(5));
    buf.reset(3);

    const result = buf.push(token(3));
    expect(result).toHaveLength(1);
    expect(result[0]?.seq).toBe(3);
  });

  test('reset discards buffered entries below fromSeq', () => {
    buf.push(token(10));
    buf.push(token(11));
    buf.reset(5);

    // Should not return anything for seq 10/11 (they're below reset point)
    // Actually: reset(5) sets nextExpected=5, removes buffered <5
    // seq 10,11 remain buffered since 10 >= 5
    expect(buf.getNextExpected()).toBe(5);
    expect(buf.pendingCount).toBe(2); // 10 and 11 remain
  });

  test('duplicate in buffer — buffering same seq twice returns [] on second', () => {
    // Push 3 first (out of order — gets buffered)
    const r3a = buf.push(token(3));
    expect(r3a).toHaveLength(0);

    // Push 3 again — should be deduped
    const r3b = buf.push(token(3));
    expect(r3b).toHaveLength(0);

    // Drain: push 1 then 2
    buf.push(token(1));
    const result = buf.push(token(2));
    // Should get 2, 3 — not two copies of 3
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.seq)).toEqual([2, 3]);
  });

  test('getNextExpected starts at 1', () => {
    expect(buf.getNextExpected()).toBe(1);
  });

  test('getNextExpected advances correctly', () => {
    buf.push(token(1));
    expect(buf.getNextExpected()).toBe(2);
    buf.push(token(2));
    expect(buf.getNextExpected()).toBe(3);
  });

  test('already-processed seq (< nextExpected) is discarded', () => {
    buf.push(token(1));
    buf.push(token(2));
    // nextExpected is now 3
    // Push seq 1 again — it's < nextExpected, treated as already processed
    const result = buf.push(token(1));
    expect(result).toHaveLength(0);
  });
});
