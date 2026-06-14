'use client';

/**
 * ToolCallCard.tsx — Displays a tool call and its result.
 *
 * Pending: animated amber left border
 * Resolved: green border, result JSON revealed with card-in animation
 * Multiple sequential calls render as a stacked list.
 */

import React, { memo, useState } from 'react';
import type { ToolCallEntry } from '@/src/types';
import { useAgentStore } from '@/src/store/agentStore';

interface ToolCallCardProps {
  toolCall: ToolCallEntry;
}

const ToolCallCard = memo(function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [argsExpanded, setArgsExpanded] = useState(true);
  const [resultExpanded, setResultExpanded] = useState(true);
  const focusToolCall = useAgentStore((s) => s.focusToolCall);
  const isFocused = useAgentStore((s) => s.focusedCallId === toolCall.call_id);

  const isPending = toolCall.status === 'pending';

  return (
    <div
      className="card-in"
      style={{
        borderRadius: 6,
        marginBottom: 8,
        border: `1px solid ${isPending ? '#4d3200' : '#003d28'}`,
        borderLeft: `3px solid ${isPending ? '#f59e0b' : '#10d9a0'}`,
        background: isPending ? '#160e00' : '#001a10',
        minHeight: 80,
        overflow: 'hidden',
        outline: isFocused ? '1px solid #4f8ef7' : 'none',
        outlineOffset: isFocused ? '1px' : 0,
      }}
    >
      {/* Header — click to scroll the trace timeline to this call's TOOL_CALL row */}
      <div
        onClick={() => focusToolCall(toolCall.call_id)}
        title="Show in trace timeline"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          cursor: 'pointer',
          borderBottom: `1px solid ${isPending ? '#2a1a0066' : '#002a1a66'}`,
        }}
      >
        {/* Status dot */}
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: isPending ? '#f59e0b' : '#10d9a0',
            flexShrink: 0,
            boxShadow: isPending ? undefined : '0 0 5px #10d9a0',
          }}
          className={isPending ? 'animate-pulse' : ''}
        />

        {/* Tool name */}
        <span
          style={{
            fontSize: '11px',
            fontFamily: 'monospace',
            fontWeight: 700,
            color: isPending ? '#fbbf24' : '#34d399',
            letterSpacing: '0.03em',
          }}
        >
          {toolCall.tool_name}
        </span>

        {/* Call ID */}
        <span
          style={{
            fontSize: '9px',
            fontFamily: 'monospace',
            color: 'var(--text-3)',
          }}
        >
          {toolCall.call_id.slice(0, 10)}…
        </span>

        {/* Status badge */}
        <span
          style={{
            marginLeft: 'auto',
            fontSize: '9px',
            fontFamily: 'monospace',
            fontWeight: 700,
            letterSpacing: '0.07em',
            padding: '2px 7px',
            borderRadius: 3,
            background: isPending ? '#271a00' : '#001f14',
            border: `1px solid ${isPending ? '#4d3200' : '#003d28'}`,
            color: isPending ? '#fbbf24' : '#34d399',
          }}
        >
          {isPending ? 'PENDING' : 'RESOLVED'}
        </span>
      </div>

      {/* Args */}
      <div style={{ padding: '8px 12px' }}>
        <button
          style={{
            fontSize: '9px',
            fontFamily: 'monospace',
            color: 'var(--text-3)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginBottom: 4,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
          onClick={() => setArgsExpanded((v) => !v)}
        >
          {argsExpanded ? '▾' : '▸'} Arguments
        </button>
        {argsExpanded && (
          <pre
            style={{
              fontSize: '10px',
              fontFamily: 'monospace',
              background: '#0a0a0f',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '8px',
              overflowX: 'auto',
              maxHeight: 120,
              color: '#94a3b8',
              margin: 0,
            }}
          >
            {JSON.stringify(toolCall.args, null, 2)}
          </pre>
        )}
      </div>

      {/* Result */}
      {!isPending && toolCall.result && (
        <div style={{ padding: '0 12px 10px' }}>
          <button
            style={{
              fontSize: '9px',
              fontFamily: 'monospace',
              color: '#10d9a0',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              marginBottom: 4,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
            onClick={() => setResultExpanded((v) => !v)}
          >
            {resultExpanded ? '▾' : '▸'} Result
          </button>
          {resultExpanded && (
            <pre
              style={{
                fontSize: '10px',
                fontFamily: 'monospace',
                background: '#001208',
                border: '1px solid #003d28',
                borderRadius: 4,
                padding: '8px',
                overflowX: 'auto',
                maxHeight: 120,
                color: '#34d399',
                margin: 0,
              }}
            >
              {JSON.stringify(toolCall.result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
});

/* ── Stack of tool calls ──────────────────────────────────────────────────── */

interface ToolCallStackProps {
  toolCalls: ToolCallEntry[];
}

export const ToolCallStack = memo(function ToolCallStack({
  toolCalls,
}: ToolCallStackProps) {
  if (toolCalls.length === 0) return null;

  return (
    <div style={{ marginTop: 10 }}>
      {toolCalls.map((tc) => (
        <ToolCallCard key={tc.call_id} toolCall={tc} />
      ))}
    </div>
  );
});

export default ToolCallCard;
