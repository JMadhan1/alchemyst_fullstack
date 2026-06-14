/**
 * metricsTracker.ts — Real-time protocol performance metrics.
 *
 * Tracks: tokens/sec, round-trip latency (PING→PONG), TOOL_ACK timing,
 * duplicate/reorder event counts. Used by the header metrics bar.
 */

export interface LiveMetrics {
  tokensPerSec: number;
  pingLatencyMs: number | null;
  toolAckLatencyMs: number | null;
  totalTokens: number;
  totalMessages: number;
  reorderCount: number;
  duplicateCount: number;
  dropCount: number;
  chaosEvents: ChaosEvent[];
  complianceScore: number; // 0–100
}

export interface ChaosEvent {
  type: 'REORDER' | 'DUPLICATE' | 'DROP' | 'CORRUPT_PING' | 'LARGE_CONTEXT' | 'RAPID_TOOL';
  timestamp: number;
  detail: string;
}

export interface PingRecord {
  challenge: string;
  sentAt: number;
  ackedAt: number | null;
}

export class MetricsTracker {
  private tokenTimestamps: number[] = [];
  private pingRecords: Map<string, PingRecord> = new Map();
  private toolAckLatencies: number[] = [];
  private reorderCount = 0;
  private duplicateCount = 0;
  private dropCount = 0;
  private totalTokens = 0;
  private totalMessages = 0;
  private chaosEvents: ChaosEvent[] = [];
  private listeners: Array<(m: LiveMetrics) => void> = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Token tracking ──────────────────────────────────────────────────────────

  recordToken(): void {
    const now = Date.now();
    this.tokenTimestamps.push(now);
    this.totalTokens++;
    this.totalMessages++;
    // Keep only last 5 seconds of timestamps
    const cutoff = now - 5000;
    this.tokenTimestamps = this.tokenTimestamps.filter((t) => t > cutoff);
    this.scheduleFlush();
  }

  private getTokensPerSec(): number {
    const now = Date.now();
    const cutoff = now - 1000;
    const recent = this.tokenTimestamps.filter((t) => t > cutoff);
    return recent.length;
  }

  // ── PING/PONG tracking ──────────────────────────────────────────────────────

  recordPing(challenge: string): void {
    this.pingRecords.set(challenge, {
      challenge,
      sentAt: Date.now(),
      ackedAt: null,
    });
    this.totalMessages++;
  }

  recordPong(challenge: string): void {
    const record = this.pingRecords.get(challenge);
    if (record) {
      record.ackedAt = Date.now();
    }
    if (challenge === '') {
      this.recordChaos('CORRUPT_PING', 'PING with empty challenge — handled gracefully');
    }
    this.scheduleFlush();
  }

  private getAvgPingLatency(): number | null {
    const completed = Array.from(this.pingRecords.values()).filter(
      (r) => r.ackedAt !== null
    );
    if (completed.length === 0) return null;
    const sum = completed.reduce((acc, r) => acc + (r.ackedAt! - r.sentAt), 0);
    return Math.round(sum / completed.length);
  }

  // ── TOOL_ACK tracking ───────────────────────────────────────────────────────

  recordToolCallReceived(callId: string): void {
    this._pendingToolCalls.set(callId, Date.now());
    this.totalMessages++;
  }

  private _pendingToolCalls: Map<string, number> = new Map();

  recordToolAckSent(callId: string): void {
    const received = this._pendingToolCalls.get(callId);
    if (received) {
      const latency = Date.now() - received;
      this.toolAckLatencies.push(latency);
      this._pendingToolCalls.delete(callId);
    }
    this.scheduleFlush();
  }

  private getAvgToolAckLatency(): number | null {
    if (this.toolAckLatencies.length === 0) return null;
    const sum = this.toolAckLatencies.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.toolAckLatencies.length);
  }

  // ── Chaos event tracking ─────────────────────────────────────────────────────

  recordReorder(): void {
    this.reorderCount++;
    this.recordChaos('REORDER', `Out-of-order seq detected and buffered`);
  }

  recordDuplicate(seq: number): void {
    this.duplicateCount++;
    this.recordChaos('DUPLICATE', `Duplicate seq ${seq} deduplicated`);
  }

  recordDrop(): void {
    this.dropCount++;
    this.recordChaos('DROP', `Connection drop detected — reconnecting`);
  }

  recordLargeContext(sizeBytes: number): void {
    this.recordChaos(
      'LARGE_CONTEXT',
      `Context snapshot ${(sizeBytes / 1024).toFixed(0)}KB — lazy render`
    );
  }

  recordRapidToolCalls(count: number): void {
    this.recordChaos('RAPID_TOOL', `${count} rapid tool calls — stacked cards rendered`);
  }

  private recordChaos(type: ChaosEvent['type'], detail: string): void {
    this.chaosEvents.push({ type, timestamp: Date.now(), detail });
    // Keep last 50 chaos events
    if (this.chaosEvents.length > 50) {
      this.chaosEvents = this.chaosEvents.slice(-50);
    }
    this.scheduleFlush();
  }

  // ── Compliance score ─────────────────────────────────────────────────────────

  private computeComplianceScore(): number {
    let score = 100;

    // Deduct for missed/late PONGs (> 3s)
    const latePongs = Array.from(this.pingRecords.values()).filter(
      (r) => r.ackedAt !== null && r.ackedAt - r.sentAt > 3000
    );
    score -= Math.min(30, latePongs.length * 10);

    // Deduct for late TOOL_ACKs (> 2s)
    const lateAcks = this.toolAckLatencies.filter((l) => l > 2000);
    score -= Math.min(20, lateAcks.length * 10);

    return Math.max(0, score);
  }

  // ── Pub/sub ──────────────────────────────────────────────────────────────────

  subscribe(listener: (m: LiveMetrics) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.emit();
    }, 100);
  }

  private emit(): void {
    const metrics: LiveMetrics = {
      tokensPerSec: this.getTokensPerSec(),
      pingLatencyMs: this.getAvgPingLatency(),
      toolAckLatencyMs: this.getAvgToolAckLatency(),
      totalTokens: this.totalTokens,
      totalMessages: this.totalMessages,
      reorderCount: this.reorderCount,
      duplicateCount: this.duplicateCount,
      dropCount: this.dropCount,
      chaosEvents: [...this.chaosEvents],
      complianceScore: this.computeComplianceScore(),
    };
    for (const l of this.listeners) l(metrics);
  }

  getSnapshot(): LiveMetrics {
    return {
      tokensPerSec: this.getTokensPerSec(),
      pingLatencyMs: this.getAvgPingLatency(),
      toolAckLatencyMs: this.getAvgToolAckLatency(),
      totalTokens: this.totalTokens,
      totalMessages: this.totalMessages,
      reorderCount: this.reorderCount,
      duplicateCount: this.duplicateCount,
      dropCount: this.dropCount,
      chaosEvents: [...this.chaosEvents],
      complianceScore: this.computeComplianceScore(),
    };
  }

  reset(): void {
    this.tokenTimestamps = [];
    this.pingRecords = new Map();
    this.toolAckLatencies = [];
    this.reorderCount = 0;
    this.duplicateCount = 0;
    this.dropCount = 0;
    this.totalTokens = 0;
    this.totalMessages = 0;
    this.chaosEvents = [];
    this._pendingToolCalls = new Map();
  }
}

// Global singleton — shared between WSClient and components
export const metrics = new MetricsTracker();
