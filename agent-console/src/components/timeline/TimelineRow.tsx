'use client';

/**
 * TimelineRow.tsx — A single row in the trace timeline.
 *
 * Shows: timestamp, event type badge, summary.
 * Clicking focuses the corresponding chat element.
 * TOOL_CALL and TOOL_RESULT with the same call_id are visually linked.
 */

import React, { memo } from 'react';
import type { TimelineEventType } from '@/src/types';
import type { BatchedTimelineEvent } from '@/src/hooks/useTimeline';
import { TokenBatch } from './TokenBatch';
import { useAgentStore } from '@/src/store/agentStore';

/* Inline colors — no Tailwind class lookup needed */
const TYPE_META: Record<TimelineEventType, { bg: string; border: string; text: string; dot: string }> = {
  TOKEN:            { bg: '#0d1f3c', border: '#1e3d6b', text: '#60a5fa', dot: '#4f8ef7' },
  TOOL_CALL:        { bg: '#271a00', border: '#4d3200', text: '#fbbf24', dot: '#f59e0b' },
  TOOL_RESULT:      { bg: '#001f14', border: '#003d28', text: '#34d399', dot: '#10d9a0' },
  PING:             { bg: '#111118', border: '#1e1e35', text: '#6b7280', dot: '#374151' },
  PONG:             { bg: '#111118', border: '#1e1e35', text: '#4b5563', dot: '#2d3748' },
  CONTEXT_SNAPSHOT: { bg: '#1c0f3f', border: '#3b1f7a', text: '#c4b5fd', dot: '#a78bfa' },
  STREAM_END:       { bg: '#0d1a24', border: '#1e3545', text: '#7dd3fc', dot: '#38bdf8' },
  ERROR:            { bg: '#2a0a0a', border: '#5a1717', text: '#fca5a5', dot: '#f87171' },
  CONNECTED:        { bg: '#001f14', border: '#003d28', text: '#34d399', dot: '#10d9a0' },
  RECONNECTING:     { bg: '#271a00', border: '#4d3200', text: '#fbbf24', dot: '#f59e0b' },
  RESUMED:          { bg: '#1c0f3f', border: '#3b1f7a', text: '#c4b5fd', dot: '#a78bfa' },
};

interface TimelineRowProps {
  event: BatchedTimelineEvent;
  isFocused: boolean;
  isLinkedPair: boolean;
}

export const TimelineRow = memo(function TimelineRow({
  event,
  isFocused,
  isLinkedPair,
}: TimelineRowProps) {
  const focusTimelineEvent = useAgentStore((s) => s.focusTimelineEvent);

  const handleClick = () => {
    focusTimelineEvent({ id: event.id, call_id: event.call_id, stream_id: event.stream_id });
  };

  const time = new Date(event.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const ms = new Date(event.timestamp).getMilliseconds().toString().padStart(3, '0');

  const meta = TYPE_META[event.type] ?? TYPE_META.PING;

  return (
    <div
      onClick={handleClick}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '7px 12px',
        cursor: 'pointer',
        borderBottom: '1px solid var(--border-dim)',
        borderLeft: `2px solid ${isFocused ? '#4f8ef7' : isLinkedPair ? '#f59e0b40' : 'transparent'}`,
        background: isFocused ? '#0d1f3c30' : 'transparent',
        transition: 'background 0.12s',
      }}
      onMouseEnter={(e) => {
        if (!isFocused) (e.currentTarget as HTMLDivElement).style.background = '#ffffff06';
      }}
      onMouseLeave={(e) => {
        if (!isFocused) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
      }}
    >
      {/* Dot */}
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: meta.dot,
          flexShrink: 0,
          marginTop: 5,
          boxShadow: isFocused ? `0 0 6px ${meta.dot}` : 'none',
        }}
      />

      {/* Timestamp col */}
      <div
        style={{
          flexShrink: 0,
          width: 70,
          fontSize: '9px',
          fontFamily: 'monospace',
          color: 'var(--text-3)',
          lineHeight: 1.4,
          paddingTop: 1,
        }}
      >
        <div>{time}</div>
        <div style={{ color: '#252545' }}>.{ms}</div>
      </div>

      {/* Badge + content */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span
            style={{
              fontSize: '8px',
              fontFamily: 'monospace',
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              padding: '1px 5px',
              borderRadius: 3,
              background: meta.bg,
              border: `1px solid ${meta.border}`,
              color: meta.text,
              flexShrink: 0,
            }}
          >
            {event.type}
          </span>
          {event.call_id && (
            <span style={{ fontSize: '8px', fontFamily: 'monospace', color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {event.call_id.slice(0, 8)}
            </span>
          )}
        </div>

        {event.isBatch && event.type === 'TOKEN' ? (
          <TokenBatch
            count={event.batchCount}
            durationMs={event.batchDurationMs}
            text={event.tokenBatchText}
            timestamp={event.timestamp}
          />
        ) : (
          <span
            style={{
              fontSize: '10px',
              fontFamily: 'monospace',
              color: 'var(--text-2)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {event.summary}
          </span>
        )}
      </div>
    </div>
  );
});
