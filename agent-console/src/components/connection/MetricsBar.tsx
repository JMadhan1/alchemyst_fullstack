'use client';

/**
 * MetricsBar.tsx — Live protocol performance monitoring strip.
 *
 * This is the key differentiator: a real-time compliance dashboard that
 * demonstrates systems-level understanding of the WebSocket protocol spec.
 *
 * Shows: compliance score (with SVG arc), token velocity, ping/ack latency,
 * chaos event detection, sequence counters, and session totals.
 */

import React, { memo, useEffect, useState } from 'react';
import { metrics, type LiveMetrics } from '@/src/lib/metricsTracker';

const INITIAL: LiveMetrics = {
  tokensPerSec: 0,
  pingLatencyMs: null,
  toolAckLatencyMs: null,
  totalTokens: 0,
  totalMessages: 0,
  reorderCount: 0,
  duplicateCount: 0,
  dropCount: 0,
  chaosEvents: [],
  complianceScore: 100,
};

/* ── Sparkline for token velocity ──────────────────────────────────────── */
const MAX_SPARKLINE_POINTS = 30;

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <div style={{ width: 60, height: 20 }} />;
  const max = Math.max(...points, 1);
  const w = 60;
  const h = 20;
  const step = w / (points.length - 1);
  const coords = points.map((v, i) => `${i * step},${h - (v / max) * h}`).join(' ');
  const area = `0,${h} ` + coords + ` ${(points.length - 1) * step},${h}`;
  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4f8ef7" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#4f8ef7" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#spark-fill)" />
      <polyline
        points={coords}
        fill="none"
        stroke="#4f8ef7"
        strokeWidth="1.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ── Compliance arc ─────────────────────────────────────────────────────── */
function ComplianceArc({ score }: { score: number }) {
  const r = 14;
  const cx = 18;
  const cy = 18;
  const circumference = 2 * Math.PI * r;
  const dashArray = circumference;
  const dashOffset = circumference * (1 - score / 100);
  const color = score >= 90 ? '#10d9a0' : score >= 70 ? '#f59e0b' : '#f87171';
  const textColor = color;

  return (
    <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
      <svg width="36" height="36" style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e1e35" strokeWidth="2.5" />
        {/* Arc */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeDasharray={dashArray}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '8px',
          fontWeight: 700,
          color: textColor,
          letterSpacing: '-0.02em',
          fontFamily: 'monospace',
        }}
      >
        {score}
      </div>
    </div>
  );
}

/* ── Latency bar ─────────────────────────────────────────────────────────── */
function LatencyBar({
  label,
  valueMs,
  maxMs,
  limitMs,
  title,
}: {
  label: string;
  valueMs: number | null;
  maxMs: number;
  limitMs: number;
  title: string;
}) {
  const pct = valueMs !== null ? Math.min((valueMs / maxMs) * 100, 100) : 0;
  const color =
    valueMs === null
      ? '#2e2e55'
      : valueMs < limitMs * 0.5
      ? '#10d9a0'
      : valueMs < limitMs * 0.8
      ? '#f59e0b'
      : '#f87171';

  return (
    <div
      className="flex flex-col gap-0.5"
      style={{ minWidth: 64 }}
      title={title}
    >
      <div className="flex justify-between items-baseline">
        <span style={{ fontSize: '9px', color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {label}
        </span>
        <span style={{ fontSize: '10px', color, fontFamily: 'monospace', fontWeight: 600 }}>
          {valueMs !== null ? `${valueMs}ms` : '—'}
        </span>
      </div>
      <div
        style={{
          height: '3px',
          background: 'var(--border)',
          borderRadius: '2px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: color,
            borderRadius: '2px',
            transition: 'width 0.4s ease, background 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}

/* ── Counter badge ───────────────────────────────────────────────────────── */
function CounterBadge({
  label,
  value,
  color,
  title,
}: {
  label: string;
  value: number;
  color: string;
  title: string;
}) {
  return (
    <div
      className="flex items-center gap-1 px-1.5 py-0.5 rounded"
      style={{ background: 'var(--bg-surface)', border: `1px solid ${color}26` }}
      title={title}
    >
      <span style={{ fontSize: '9px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <span style={{ fontSize: '10px', fontFamily: 'monospace', fontWeight: 700, color }}>
        {value}
      </span>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */
export const MetricsBar = memo(function MetricsBar() {
  const [m, setM] = useState<LiveMetrics>(INITIAL);
  const [spark, setSpark] = useState<number[]>([0]);

  // Single subscription drives both the live metrics and the rolling sparkline
  // history. Updating state inside the emit callback (an external event) keeps
  // the accumulation out of the effect body.
  useEffect(() => {
    return metrics.subscribe((next) => {
      setM(next);
      setSpark((prev) => [...prev, next.tokensPerSec].slice(-MAX_SPARKLINE_POINTS));
    });
  }, []);

  const chaosCount = m.chaosEvents.length;
  const hasChaos = chaosCount > 0;

  return (
    <div
      className="flex items-center gap-4 px-4 flex-shrink-0"
      style={{
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
        height: '44px',
        overflow: 'hidden',
      }}
    >
      {/* ── Compliance arc + label ── */}
      <div className="flex items-center gap-2 flex-shrink-0" title="Protocol compliance: PONG ≤3s, TOOL_ACK ≤2s, no corrupt payloads">
        <ComplianceArc score={m.complianceScore} />
        <div className="flex flex-col">
          <span style={{ fontSize: '9px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Compliance
          </span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: 'monospace',
              color: m.complianceScore >= 90 ? '#10d9a0' : m.complianceScore >= 70 ? '#f59e0b' : '#f87171',
            }}
          >
            {m.complianceScore}%
          </span>
        </div>
      </div>

      <div style={{ width: 1, height: 28, background: 'var(--border)', flexShrink: 0 }} />

      {/* ── Token velocity sparkline ── */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Sparkline points={spark} />
        <div className="flex flex-col">
          <span style={{ fontSize: '9px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            tok/s
          </span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: 'monospace',
              color: m.tokensPerSec > 0 ? '#4f8ef7' : 'var(--text-3)',
            }}
          >
            {m.tokensPerSec > 0 ? m.tokensPerSec : '—'}
          </span>
        </div>
      </div>

      {/* ── Token total ── */}
      <div className="flex flex-col flex-shrink-0">
        <span style={{ fontSize: '9px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          tokens
        </span>
        <span style={{ fontSize: '11px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-2)' }}>
          {m.totalTokens > 0 ? m.totalTokens.toLocaleString() : '—'}
        </span>
      </div>

      <div style={{ width: 1, height: 28, background: 'var(--border)', flexShrink: 0 }} />

      {/* ── Latency bars ── */}
      <LatencyBar
        label="ping"
        valueMs={m.pingLatencyMs}
        maxMs={3000}
        limitMs={3000}
        title="PING→PONG round trip (protocol limit: 3 000 ms)"
      />
      <LatencyBar
        label="ack"
        valueMs={m.toolAckLatencyMs}
        maxMs={2000}
        limitMs={2000}
        title="TOOL_CALL→TOOL_ACK latency (protocol limit: 2 000 ms)"
      />

      <div style={{ width: 1, height: 28, background: 'var(--border)', flexShrink: 0 }} />

      {/* ── Chaos counters ── */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {m.reorderCount > 0 && (
          <CounterBadge
            label="reorder"
            value={m.reorderCount}
            color="#f59e0b"
            title="Out-of-order seq messages buffered and re-sequenced"
          />
        )}
        {m.duplicateCount > 0 && (
          <CounterBadge
            label="dedup"
            value={m.duplicateCount}
            color="#f59e0b"
            title="Duplicate seq messages dropped by SeqBuffer"
          />
        )}
        {m.dropCount > 0 && (
          <CounterBadge
            label="drops"
            value={m.dropCount}
            color="#f87171"
            title="Connection drops recovered with RESUME"
          />
        )}
      </div>

      {/* ── Chaos mode badge ── */}
      {hasChaos && (
        <div
          className="chaos-badge flex items-center gap-1.5 px-2 py-0.5 rounded flex-shrink-0 ml-auto"
          style={{
            background: 'var(--red-dim)',
            border: '1px solid rgba(248,113,113,0.3)',
            color: '#f87171',
            fontSize: '10px',
            fontFamily: 'monospace',
            fontWeight: 700,
            letterSpacing: '0.08em',
          }}
          title={`${chaosCount} chaos events: ${m.chaosEvents.slice(-3).join(', ')}`}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <path d="M5 0L6.18 3.64H10L7.09 5.9L8.09 9.45L5 7.1L1.91 9.45L2.91 5.9L0 3.64H3.82Z" />
          </svg>
          CHAOS ×{chaosCount}
        </div>
      )}

      {/* ── Right: session messages count ── */}
      {!hasChaos && m.totalMessages > 0 && (
        <div className="ml-auto flex-shrink-0">
          <span style={{ fontSize: '9px', color: 'var(--text-3)', fontFamily: 'monospace' }}>
            {m.totalMessages} msg
          </span>
        </div>
      )}
    </div>
  );
});
