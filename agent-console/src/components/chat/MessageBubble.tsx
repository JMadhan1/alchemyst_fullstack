'use client';

/**
 * MessageBubble.tsx — Renders a single chat message.
 *
 * Memoized so the entire list doesn't re-render on every token.
 * The parent (ChatPanel) passes stable props; only the active streaming
 * message gets updated text props each token.
 */

import React, { memo, useEffect, useRef } from 'react';
import type { ChatMessage } from '@/src/types';
import { StreamingText } from './StreamingText';
import { ToolCallStack } from './ToolCallCard';

interface MessageBubbleProps {
  message: ChatMessage;
  isFocused: boolean;
  onRendered?: (seq: number) => void;
  lastSeq?: number;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isFocused,
  onRendered,
  lastSeq,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const ref = useRef<HTMLDivElement>(null);

  // After commit, notify WSClient of the highest rendered seq
  useEffect(() => {
    if (lastSeq && lastSeq > 0 && onRendered) {
      onRendered(lastSeq);
    }
  }, [lastSeq, onRendered]);

  // Scroll into view when this becomes focused
  useEffect(() => {
    if (isFocused && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isFocused]);

  return (
    <div
      ref={ref}
      data-message-id={message.id}
      style={{
        display: 'flex',
        marginBottom: 12,
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        outline: isFocused ? '1px solid #4f8ef750' : 'none',
        borderRadius: 8,
        padding: 2,
      }}
    >
      {/* Avatar dot for agent messages */}
      {!isUser && (
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: 'var(--bg-raised)',
            border: '1px solid var(--border)',
            flexShrink: 0,
            marginRight: 8,
            marginTop: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <polygon
              points="5,0.5 9.33,2.75 9.33,7.25 5,9.5 0.67,7.25 0.67,2.75"
              stroke="#4f8ef7"
              strokeWidth="0.8"
              fill="rgba(79,142,247,0.1)"
            />
          </svg>
        </div>
      )}

      <div style={{ maxWidth: '78%', minWidth: 0 }}>
        {/* Header row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 4,
            justifyContent: isUser ? 'flex-end' : 'flex-start',
          }}
        >
          <span
            style={{
              fontSize: '9px',
              fontFamily: 'monospace',
              color: 'var(--text-3)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {isUser ? 'you' : 'agent'}
          </span>
          <span style={{ fontSize: '9px', fontFamily: 'monospace', color: '#252545' }}>
            {formatTime(message.createdAt)}
          </span>
          {message.stream_id && (
            <span style={{ fontSize: '8px', fontFamily: 'monospace', color: '#252545' }}>
              stream:{message.stream_id.slice(0, 6)}
            </span>
          )}
        </div>

        {/* Bubble */}
        <div
          style={{
            borderRadius: isUser ? '10px 10px 2px 10px' : '2px 10px 10px 10px',
            padding: '10px 14px',
            background: isUser
              ? 'linear-gradient(135deg, #1d3461 0%, #1a2f58 100%)'
              : 'var(--bg-surface)',
            border: `1px solid ${isUser ? '#1e3d6b' : 'var(--border)'}`,
            boxShadow: isUser
              ? '0 2px 8px rgba(29,78,216,0.1)'
              : '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          {isUser ? (
            <p
              style={{
                fontSize: '13px',
                fontFamily: 'monospace',
                color: '#bfdbfe',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: 0,
              }}
            >
              {message.text}
            </p>
          ) : (
            <>
              <StreamingText
                text={message.text}
                isStreaming={
                  message.isStreaming &&
                  message.toolCalls.every((tc) => tc.status === 'resolved')
                }
              />
              <ToolCallStack toolCalls={message.toolCalls} />
            </>
          )}
        </div>
      </div>
    </div>
  );
});
