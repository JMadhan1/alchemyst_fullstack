'use client';

/**
 * ConnectionIndicator.tsx — Header connection status + connect/disconnect button.
 *
 * The status dot animates when connected (glow) or reconnecting (pulse).
 * The connect button has a glow effect matching the design's blue accent color.
 */

import React, { memo } from 'react';
import type { ConnectionState } from '@/src/types';

interface ConnectionIndicatorProps {
  state: ConnectionState;
  onConnect: () => void;
  onDisconnect: () => void;
}

const STATE_LABEL: Record<ConnectionState, string> = {
  IDLE: 'IDLE',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  STREAMING: 'STREAMING',
  TOOL_CALL_PENDING: 'TOOL_PENDING',
  RECONNECTING: 'RECONNECTING',
  RESUMING: 'RESUMING',
  CLOSED: 'CLOSED',
};

function getDotStyle(state: ConnectionState): React.CSSProperties {
  const base: React.CSSProperties = {
    width: 7,
    height: 7,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'inline-block',
  };
  switch (state) {
    case 'CONNECTED':
    case 'STREAMING':
    case 'TOOL_CALL_PENDING':
      return { ...base, background: '#10d9a0', boxShadow: '0 0 6px #10d9a0' };
    case 'CONNECTING':
    case 'RECONNECTING':
    case 'RESUMING':
      return { ...base, background: '#f59e0b' };
    case 'CLOSED':
    case 'IDLE':
    default:
      return { ...base, background: '#2e3a4e' };
  }
}

function getTextColor(state: ConnectionState): string {
  switch (state) {
    case 'CONNECTED':
    case 'STREAMING':
    case 'TOOL_CALL_PENDING':
      return '#10d9a0';
    case 'CONNECTING':
    case 'RECONNECTING':
    case 'RESUMING':
      return '#f59e0b';
    default:
      return '#4a5568';
  }
}

export const ConnectionIndicator = memo(function ConnectionIndicator({
  state,
  onConnect,
  onDisconnect,
}: ConnectionIndicatorProps) {
  const dotStyle = getDotStyle(state);
  const isAnimating = state === 'CONNECTING' || state === 'RECONNECTING' || state === 'RESUMING';
  const isLive = state === 'CONNECTED' || state === 'STREAMING' || state === 'TOOL_CALL_PENDING';
  const showConnect = state === 'IDLE' || state === 'CLOSED';
  const showDisconnect = isLive;

  return (
    <div className="flex items-center gap-3">
      {/* Status dot + label */}
      <div className="flex items-center gap-1.5">
        <span
          style={dotStyle}
          className={isAnimating ? 'animate-pulse' : isLive ? 'status-dot-live' : ''}
        />
        <span
          className="text-xs font-mono"
          style={{ color: getTextColor(state), letterSpacing: '0.05em' }}
        >
          {STATE_LABEL[state]}
        </span>
      </div>

      {/* Action button */}
      {showConnect && (
        <button
          onClick={onConnect}
          className="text-xs font-mono px-3 py-1 rounded transition-all"
          style={{
            background: 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)',
            color: '#e8eaf6',
            border: '1px solid #2563eb',
            boxShadow: '0 0 10px rgba(79,142,247,0.2)',
            letterSpacing: '0.04em',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 16px rgba(79,142,247,0.4)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 10px rgba(79,142,247,0.2)';
          }}
        >
          Connect
        </button>
      )}

      {showDisconnect && (
        <button
          onClick={onDisconnect}
          className="text-xs font-mono px-3 py-1 rounded transition-all"
          style={{
            background: 'var(--bg-surface)',
            color: 'var(--text-3)',
            border: '1px solid var(--border)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = '#f87171';
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#f8717133';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
          }}
        >
          Disconnect
        </button>
      )}
    </div>
  );
});
