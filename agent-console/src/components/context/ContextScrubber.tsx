'use client';

/**
 * ContextScrubber.tsx — Step through context snapshot history.
 * Shows a slider + prev/next buttons below the ContextInspector.
 */

import React, { memo } from 'react';
import type { ContextSnapshot } from '@/src/types';

interface ContextScrubberProps {
  snapshots: ContextSnapshot[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
}

export const ContextScrubber = memo(function ContextScrubber({
  snapshots,
  currentIndex,
  onIndexChange,
}: ContextScrubberProps) {
  if (snapshots.length <= 1) return null;

  const current = snapshots[currentIndex];
  const total = snapshots.length;

  return (
    <div
      className="border-t px-3 py-2 flex flex-col gap-2"
      style={{ borderColor: '#1e1e2e' }}
    >
      <div className="flex items-center justify-between text-xs font-mono text-slate-500">
        <span>Snapshot {currentIndex + 1} / {total}</span>
        {current && (
          <span>{new Date(current.timestamp).toLocaleTimeString()}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          className="text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-xs px-2 py-1 rounded"
          style={{ background: '#1e1e2e' }}
          disabled={currentIndex === 0}
          onClick={() => onIndexChange(currentIndex - 1)}
          title="Previous snapshot"
        >
          ‹ Prev
        </button>

        <input
          type="range"
          className="flex-1 h-1.5 rounded appearance-none cursor-pointer accent-purple-500"
          min={0}
          max={total - 1}
          value={currentIndex}
          onChange={(e) => onIndexChange(Number(e.target.value))}
        />

        <button
          className="text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-xs px-2 py-1 rounded"
          style={{ background: '#1e1e2e' }}
          disabled={currentIndex === total - 1}
          onClick={() => onIndexChange(currentIndex + 1)}
          title="Next snapshot"
        >
          Next ›
        </button>
      </div>

      <div className="flex gap-1 overflow-hidden">
        {snapshots.map((_, i) => (
          <button
            key={i}
            onClick={() => onIndexChange(i)}
            className="flex-1 h-1 rounded-full transition-colors"
            style={{
              background: i === currentIndex ? '#a855f7' : '#1e1e2e',
              minWidth: 0,
            }}
            title={`Snapshot ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
});
