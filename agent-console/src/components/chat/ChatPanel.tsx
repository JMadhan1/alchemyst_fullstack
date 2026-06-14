'use client';

/**
 * ChatPanel.tsx — Main chat area.
 *
 * Performance guarantees:
 * - MessageBubble is memoized — only re-renders if its props change
 * - Only the active streaming message gets new text props each token
 * - Scroll position managed via useRef to avoid layout recalculation
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  KeyboardEvent,
} from 'react';
import { useAgentStore } from '@/src/store/agentStore';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from '@/src/types';

interface ChatPanelProps {
  onSendMessage: (content: string) => void;
  onRendered: (seq: number) => void;
  disabled?: boolean;
  connectionState?: string;
}

/* ── Idle state: protocol reference card ───────────────────────────────── */
function EmptyState({ disabled, connectionState }: { disabled: boolean; connectionState?: string }) {
  const states = ['IDLE', 'CONNECTING', 'CONNECTED', 'STREAMING', 'TOOL_CALL_PENDING', 'RECONNECTING', 'RESUMING', 'CLOSED'];
  const transitions = [
    { from: 'IDLE', event: 'OPEN', to: 'CONNECTING' },
    { from: 'CONNECTING', event: 'WS_OPEN', to: 'CONNECTED' },
    { from: 'CONNECTED', event: 'TOKEN', to: 'STREAMING' },
    { from: 'STREAMING', event: 'TOOL_CALL', to: 'TOOL_CALL_PENDING' },
    { from: 'TOOL_CALL_PENDING', event: 'TOOL_RESULT', to: 'STREAMING' },
    { from: 'STREAMING', event: 'STREAM_END', to: 'CONNECTED' },
    { from: 'CONNECTED', event: 'WS_CLOSE', to: 'RECONNECTING' },
    { from: 'RECONNECTING', event: 'WS_OPEN', to: 'RESUMING' },
    { from: 'RESUMING', event: 'RESUMED', to: 'CONNECTED' },
  ];

  const capabilities = [
    { icon: '⟳', label: 'Auto-RESUME', desc: 'last_seq on reconnect' },
    { icon: '⟦⟧', label: 'SeqBuffer', desc: 'reorder + dedup' },
    { icon: '⚡', label: 'Chaos mode', desc: 'OOO / drops / dupes' },
    { icon: '◈', label: 'JSON diff', desc: 'context snapshot delta' },
    { icon: '⊞', label: 'Virtual list', desc: 'O(visible) renders' },
    { icon: '⧖', label: 'Backoff', desc: '500ms→10s exponential' },
  ];

  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-6 px-6"
      style={{ color: 'var(--text-3)' }}
    >
      {/* Hex logo large */}
      <div style={{ opacity: disabled ? 0.4 : 0.6 }}>
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <polygon
            points="24,2 44,13 44,35 24,46 4,35 4,13"
            stroke="#4f8ef7"
            strokeWidth="1.5"
            fill="rgba(79,142,247,0.05)"
          />
          <polygon
            points="24,10 36,16.5 36,29.5 24,36 12,29.5 12,16.5"
            stroke="#a78bfa"
            strokeWidth="1"
            fill="rgba(167,139,250,0.05)"
          />
          <circle cx="24" cy="24" r="3.5" fill="#4f8ef7" opacity="0.7" />
        </svg>
      </div>

      {/* State machine diagram */}
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          padding: '12px 16px',
          width: '100%',
          maxWidth: '420px',
        }}
      >
        <div className="label mb-3">State machine</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '10px' }}>
          {states.map((s) => (
            <span
              key={s}
              style={{
                fontSize: '9px',
                fontFamily: 'monospace',
                padding: '2px 6px',
                borderRadius: '3px',
                background: 'var(--bg-raised)',
                border: '1px solid var(--border)',
                color: s === 'IDLE' ? '#4f8ef7'
                  : s === 'STREAMING' ? '#10d9a0'
                  : s === 'TOOL_CALL_PENDING' ? '#f59e0b'
                  : s === 'RECONNECTING' || s === 'RESUMING' ? '#a78bfa'
                  : 'var(--text-2)',
              }}
            >
              {s}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {transitions.map((t, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '10px',
                fontFamily: 'monospace',
                color: 'var(--text-3)',
              }}
            >
              <span style={{ color: 'var(--text-2)', minWidth: '120px' }}>{t.from}</span>
              <span style={{ color: 'var(--border)', fontSize: '8px' }}>─</span>
              <span style={{ color: '#4f8ef7', flex: 1, textAlign: 'center', fontSize: '9px' }}>{t.event}</span>
              <span style={{ color: 'var(--border)', fontSize: '8px' }}>→</span>
              <span style={{ color: 'var(--text-2)', minWidth: '120px', textAlign: 'right' }}>{t.to}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Capabilities grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '6px',
          width: '100%',
          maxWidth: '420px',
        }}
      >
        {capabilities.map((c) => (
          <div
            key={c.label}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '5px',
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            <span style={{ fontSize: '12px', color: '#4f8ef7' }}>{c.icon}</span>
            <span style={{ fontSize: '9px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-2)', letterSpacing: '0.04em' }}>
              {c.label}
            </span>
            <span style={{ fontSize: '9px', color: 'var(--text-3)' }}>{c.desc}</span>
          </div>
        ))}
      </div>

      <p style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-3)' }}>
        {connectionState === 'RECONNECTING'
          ? 'Reconnecting — chat will resume automatically…'
          : connectionState === 'RESUMING'
          ? 'Resuming session — replaying missed events…'
          : connectionState === 'CONNECTING'
          ? 'Opening WebSocket connection…'
          : disabled
          ? 'Click Connect to open the WebSocket connection'
          : 'Connecting…'}
      </p>
    </div>
  );
}

/* ── Main ChatPanel ─────────────────────────────────────────────────────── */
export const ChatPanel = memo(function ChatPanel({
  onSendMessage,
  onRendered,
  disabled = false,
  connectionState,
}: ChatPanelProps) {
  const messages = useAgentStore((s) => s.messages);
  const focusedCallId = useAgentStore((s) => s.focusedCallId);
  const focusedStreamId = useAgentStore((s) => s.focusedStreamId);
  const activeStreams = useAgentStore((s) => s.activeStreams);

  // Timeline → chat: a message lights up when the focused timeline row belongs
  // to one of its tool calls (call_id) or its token stream (stream_id).
  const isMessageFocused = useCallback(
    (msg: ChatMessage) => {
      if (focusedCallId && msg.toolCalls.some((tc) => tc.call_id === focusedCallId)) return true;
      if (focusedStreamId && msg.stream_id === focusedStreamId) return true;
      return false;
    },
    [focusedCallId, focusedStreamId]
  );

  const [inputText, setInputText] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  // Auto-scroll to bottom on new messages IF user hasn't scrolled up
  useEffect(() => {
    if (isAtBottomRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  // Also scroll on token append for the active stream
  const lastMsg = messages[messages.length - 1];
  const lastMsgText = lastMsg?.text ?? '';
  useEffect(() => {
    if (isAtBottomRef.current && bottomRef.current && lastMsg?.isStreaming) {
      bottomRef.current.scrollIntoView({ behavior: 'instant' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMsgText]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isAtBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  const handleSubmit = useCallback(() => {
    const content = inputText.trim();
    if (!content || disabled) return;
    onSendMessage(content);
    setInputText('');
  }, [inputText, disabled, onSendMessage]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const getLastSeqForMessage = useCallback(
    (streamId: string | null): number => {
      if (!streamId) return 0;
      const stream = activeStreams.get(streamId);
      return stream?.lastTokenSeq ?? 0;
    },
    [activeStreams]
  );

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'var(--bg-base)' }}
    >
      {/* ── Message list ── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        style={{ padding: messages.length === 0 ? 0 : '16px' }}
        onScroll={handleScroll}
      >
        {messages.length === 0 ? (
          <EmptyState disabled={disabled} connectionState={connectionState} />
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isFocused={isMessageFocused(msg)}
              onRendered={onRendered}
              lastSeq={getLastSeqForMessage(msg.stream_id)}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Input area ── */}
      <div
        style={{
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-panel)',
          padding: '10px 12px',
          display: 'flex',
          gap: '8px',
          alignItems: 'flex-end',
        }}
      >
        <div
          className="input-ring"
          style={{
            flex: 1,
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            transition: 'border-color 0.2s',
            borderColor: isFocused ? '#4f8ef740' : 'var(--border)',
          }}
        >
          <textarea
            className="w-full resize-none font-mono outline-none"
            style={{
              background: 'transparent',
              color: disabled ? 'var(--text-3)' : 'var(--text-1)',
              fontSize: '13px',
              lineHeight: '1.6',
              padding: '8px 10px',
              minHeight: '40px',
              maxHeight: '120px',
              display: 'block',
              width: '100%',
            }}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={
              connectionState === 'RECONNECTING' || connectionState === 'RESUMING'
                ? 'Reconnecting — will resume automatically…'
                : disabled
                ? 'Connect first to send messages…'
                : 'Send a message… (Enter ↵  to send, Shift+Enter for newline)'
            }
            disabled={disabled}
            rows={1}
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={disabled || !inputText.trim()}
          style={{
            background:
              disabled || !inputText.trim()
                ? 'var(--bg-raised)'
                : 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)',
            color:
              disabled || !inputText.trim() ? 'var(--text-3)' : '#e8eaf6',
            border: `1px solid ${disabled || !inputText.trim() ? 'var(--border)' : '#2563eb'}`,
            borderRadius: '6px',
            fontSize: '12px',
            fontFamily: 'monospace',
            fontWeight: 600,
            letterSpacing: '0.04em',
            padding: '0 14px',
            minHeight: '40px',
            cursor: disabled || !inputText.trim() ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            boxShadow:
              !disabled && inputText.trim()
                ? '0 0 8px rgba(79,142,247,0.2)'
                : 'none',
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
});
