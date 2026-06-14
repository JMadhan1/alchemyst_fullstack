'use client';

/**
 * useTimeline.ts — Derived timeline state from the Zustand store.
 *
 * Applies filtering, batching consecutive TOKEN events, and provides
 * the filtered+batched list ready for virtual rendering.
 */

import { useMemo } from 'react';
import { useAgentStore } from '@/src/store/agentStore';
import type { TimelineEvent, TimelineEventType } from '@/src/types';

export interface BatchedTimelineEvent extends TimelineEvent {
  isBatch: boolean;
  batchCount: number;
  batchDurationMs: number;
  batchStartTime: number;
  tokenBatchText: string;
}

export interface TimelineFilter {
  enabledTypes: Set<TimelineEventType>;
  searchText: string;
}

const ALL_TYPES: TimelineEventType[] = [
  'TOKEN', 'TOOL_CALL', 'TOOL_RESULT', 'PING', 'PONG',
  'CONTEXT_SNAPSHOT', 'STREAM_END', 'ERROR', 'CONNECTED',
  'RECONNECTING', 'RESUMED',
];

export const DEFAULT_FILTER: TimelineFilter = {
  enabledTypes: new Set<TimelineEventType>(ALL_TYPES),
  searchText: '',
};

/**
 * Batch consecutive TOKEN events into single BatchedTimelineEvent rows.
 * A batch is broken by any non-TOKEN event.
 */
function batchTokens(events: TimelineEvent[]): BatchedTimelineEvent[] {
  const result: BatchedTimelineEvent[] = [];
  let i = 0;

  while (i < events.length) {
    const ev = events[i];
    if (ev === undefined) { i++; continue; }

    if (ev.type !== 'TOKEN') {
      result.push({
        ...ev,
        isBatch: false,
        batchCount: 1,
        batchDurationMs: 0,
        batchStartTime: ev.timestamp,
        tokenBatchText: '',
      });
      i++;
      continue;
    }

    // Collect consecutive TOKEN events
    let batchText = ev.tokenText ?? '';
    let batchCount = 1;
    const batchStartTime = ev.timestamp;
    let lastTimestamp = ev.timestamp;
    let j = i + 1;

    while (j < events.length) {
      const next = events[j];
      if (next === undefined || next.type !== 'TOKEN') break;
      batchText += next.tokenText ?? '';
      batchCount++;
      lastTimestamp = next.timestamp;
      j++;
    }

    const batchDurationMs = lastTimestamp - batchStartTime;
    const isBatch = batchCount > 1;

    result.push({
      ...ev,
      id: isBatch ? `batch-${ev.id}` : ev.id,
      isBatch,
      batchCount,
      batchDurationMs,
      batchStartTime,
      tokenBatchText: batchText,
      summary: isBatch
        ? `Streamed ${batchCount} tokens (${(batchDurationMs / 1000).toFixed(1)}s)`
        : ev.summary,
    });

    i = j;
  }

  return result;
}

function filterEvents(
  events: BatchedTimelineEvent[],
  filter: TimelineFilter
): BatchedTimelineEvent[] {
  return events.filter((ev) => {
    if (!filter.enabledTypes.has(ev.type)) return false;
    if (filter.searchText) {
      const lower = filter.searchText.toLowerCase();
      return (
        ev.summary.toLowerCase().includes(lower) ||
        ev.type.toLowerCase().includes(lower) ||
        (ev.call_id?.toLowerCase().includes(lower) ?? false) ||
        (ev.stream_id?.toLowerCase().includes(lower) ?? false)
      );
    }
    return true;
  });
}

export function useTimeline(filter: TimelineFilter = DEFAULT_FILTER) {
  const rawEvents = useAgentStore((s) => s.timelineEvents);
  const focusedEventId = useAgentStore((s) => s.focusedEventId);

  const batched = useMemo(() => batchTokens(rawEvents), [rawEvents]);
  const filtered = useMemo(() => filterEvents(batched, filter), [batched, filter]);

  return { events: filtered, focusedEventId, totalCount: rawEvents.length };
}
