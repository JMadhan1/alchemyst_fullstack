'use client';

/**
 * TraceTimeline.tsx — Collapsible right panel showing agent trace events.
 *
 * Performance:
 * - Virtual windowing — only visible rows are rendered in the DOM
 * - Timeline state batched via requestAnimationFrame
 * - Auto-scrolls to bottom unless user has scrolled up
 */

import React, {
  memo,
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { useTimeline, DEFAULT_FILTER } from '@/src/hooks/useTimeline';
import { useAgentStore } from '@/src/store/agentStore';
import { TimelineRow } from './TimelineRow';
import { getVisibleItems } from '@/src/lib/virtualList';
import type { TimelineEventType } from '@/src/types';
import type { TimelineFilter } from '@/src/hooks/useTimeline';

const ROW_HEIGHT = 48;

/* type → display color */
const TYPE_COLOR: Record<TimelineEventType, string> = {
  TOKEN:            '#4f8ef7',
  TOOL_CALL:        '#f59e0b',
  TOOL_RESULT:      '#10d9a0',
  PING:             '#6b7280',
  PONG:             '#6b7280',
  CONTEXT_SNAPSHOT: '#a78bfa',
  STREAM_END:       '#38bdf8',
  ERROR:            '#f87171',
  CONNECTED:        '#10d9a0',
  RECONNECTING:     '#f59e0b',
  RESUMED:          '#a78bfa',
};

const ALL_TYPES: TimelineEventType[] = [
  'TOKEN', 'TOOL_CALL', 'TOOL_RESULT', 'CONTEXT_SNAPSHOT',
  'PING', 'PONG', 'RESUMED', 'ERROR', 'STREAM_END', 'CONNECTED', 'RECONNECTING',
];

export const TraceTimeline = memo(function TraceTimeline() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [filter, setFilter] = useState<TimelineFilter>(DEFAULT_FILTER);
  const [searchText, setSearchText] = useState('');

  const { events, focusedEventId, totalCount } = useTimeline(filter);
  const focusedCallId = useAgentStore((s) => s.focusedCallId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(400);
  const isAtBottomRef = useRef(true);
  const rafRef = useRef<number | null>(null);

  // A row is focused if it is the pinned row OR it shares the focused call_id
  // (so clicking a tool card in chat lights up both its TOOL_CALL and TOOL_RESULT).
  const isRowFocused = useCallback(
    (id: string, callId?: string) =>
      focusedEventId === id || (callId !== undefined && callId === focusedCallId),
    [focusedEventId, focusedCallId]
  );

  // Chat → timeline: when a call_id becomes focused, scroll its TOOL_CALL row
  // into view (the row may be outside the current virtual window).
  useEffect(() => {
    if (!focusedCallId || !scrollRef.current) return;
    const idx = events.findIndex(
      (e) => e.call_id === focusedCallId && e.type === 'TOOL_CALL'
    );
    if (idx < 0) return;
    isAtBottomRef.current = false;
    const target = Math.max(0, idx * ROW_HEIGHT - viewportHeight / 2);
    scrollRef.current.scrollTop = target;
    setScrollTop(target);
  }, [focusedCallId, events, viewportHeight]);

  const handleScroll = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const el = scrollRef.current;
      if (!el) return;
      setScrollTop(el.scrollTop);
      isAtBottomRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setViewportHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (isAtBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  const linkedCallIds = useMemo(() => {
    const seen = new Set<string>();
    const linked = new Set<string>();
    for (const ev of events) {
      if (ev.call_id !== undefined) {
        if (seen.has(ev.call_id)) linked.add(ev.call_id);
        else seen.add(ev.call_id);
      }
    }
    return linked;
  }, [events]);

  const visible = useMemo(
    () => getVisibleItems(events, scrollTop, viewportHeight, ROW_HEIGHT, 8),
    [events, scrollTop, viewportHeight]
  );

  const toggleType = useCallback((type: TimelineEventType) => {
    setFilter((prev) => {
      const next = new Set(prev.enabledTypes);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return { ...prev, enabledTypes: next };
    });
  }, []);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value;
      setSearchText(text);
      setFilter((prev) => ({ ...prev, searchText: text }));
    },
    []
  );

  if (isCollapsed) {
    return (
      <div
        onClick={() => setIsCollapsed(false)}
        title="Expand trace timeline"
        style={{
          width: 32,
          background: 'var(--bg-panel)',
          borderLeft: '1px solid var(--border)',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 12,
          cursor: 'pointer',
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: '9px',
            fontFamily: 'monospace',
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: 'var(--text-3)',
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            textTransform: 'uppercase',
          }}
        >
          TRACE
        </span>
        <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-3)' }}>
          {totalCount}
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        width: 320,
        background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border)',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          height: 40,
          borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(180deg, var(--bg-raised) 0%, var(--bg-panel) 100%)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* mini hex icon */}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <polygon
              points="6,0.5 11,3.25 11,8.75 6,11.5 1,8.75 1,3.25"
              stroke="#a78bfa"
              strokeWidth="1"
              fill="rgba(167,139,250,0.1)"
            />
          </svg>
          <span
            style={{
              fontSize: '10px',
              fontFamily: 'monospace',
              fontWeight: 700,
              color: 'var(--text-2)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            Trace
          </span>
          <span
            style={{
              fontSize: '10px',
              fontFamily: 'monospace',
              background: 'var(--bg-raised)',
              border: '1px solid var(--border)',
              color: 'var(--text-3)',
              borderRadius: 3,
              padding: '0 5px',
            }}
          >
            {totalCount}
          </span>
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          style={{
            fontSize: '10px',
            color: 'var(--text-3)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px 4px',
            lineHeight: 1,
          }}
          title="Collapse timeline"
        >
          ▶
        </button>
      </div>

      {/* ── Search ── */}
      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <input
          type="text"
          value={searchText}
          onChange={handleSearchChange}
          placeholder="Filter events…"
          style={{
            width: '100%',
            fontSize: '11px',
            fontFamily: 'monospace',
            background: 'var(--bg-base)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '4px 8px',
            color: 'var(--text-1)',
            outline: 'none',
          }}
        />
      </div>

      {/* ── Type filter chips ── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          padding: '6px 8px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        {ALL_TYPES.map((type) => {
          const active = filter.enabledTypes.has(type);
          const col = TYPE_COLOR[type];
          return (
            <button
              key={type}
              onClick={() => toggleType(type)}
              style={{
                fontSize: '8px',
                fontFamily: 'monospace',
                fontWeight: 600,
                letterSpacing: '0.06em',
                padding: '2px 6px',
                borderRadius: 3,
                border: `1px solid ${active ? col + '50' : 'var(--border)'}`,
                background: active ? col + '15' : 'transparent',
                color: active ? col : 'var(--text-3)',
                cursor: 'pointer',
                transition: 'all 0.15s',
                textTransform: 'uppercase',
              }}
            >
              {type}
            </button>
          );
        })}
      </div>

      {/* ── Virtual list ── */}
      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: 'auto', position: 'relative' }}
        onScroll={handleScroll}
      >
        <div style={{ height: visible.totalHeight, position: 'relative' }}>
          <div style={{ position: 'absolute', top: visible.offsetTop, left: 0, right: 0 }}>
            {visible.items.map((event) => (
              <TimelineRow
                key={event.id}
                event={event}
                isFocused={isRowFocused(event.id, event.call_id)}
                isLinkedPair={
                  event.call_id !== undefined && linkedCallIds.has(event.call_id)
                }
              />
            ))}
          </div>
        </div>

        {events.length === 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 8,
              color: 'var(--text-3)',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" opacity={0.3}>
              <path
                d="M12 2L20.66 7v10L12 22l-8.66-5V7L12 2z"
                stroke="currentColor"
                strokeWidth="1"
              />
              <line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="12" cy="15" r="1" fill="currentColor" />
            </svg>
            <span style={{ fontSize: '10px', fontFamily: 'monospace' }}>
              No events yet
            </span>
          </div>
        )}
      </div>
    </div>
  );
});
