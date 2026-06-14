'use client';

/**
 * TokenBatch.tsx — Expandable grouped token row.
 *
 * Shows "Streamed N tokens (X.Xs)" when collapsed.
 * Expands to show the full accumulated text.
 */

import React, { memo, useState } from 'react';

interface TokenBatchProps {
  count: number;
  durationMs: number;
  text: string;
  /** Passed by the timeline row; not rendered inside the batch itself. */
  timestamp?: number;
}

export const TokenBatch = memo(function TokenBatch({
  count,
  durationMs,
  text,
}: TokenBatchProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="w-full">
      <button
        className="w-full text-left flex items-center gap-2 group"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-slate-500 group-hover:text-slate-300 transition-colors text-xs">
          {expanded ? '▾' : '▸'}
        </span>
        <span className="text-xs font-mono text-blue-300">
          Streamed {count} token{count !== 1 ? 's' : ''}
          {durationMs > 0 && ` (${(durationMs / 1000).toFixed(1)}s)`}
        </span>
      </button>
      {expanded && (
        <div
          className="mt-1 ml-4 text-xs font-mono text-slate-400 bg-slate-900/60 rounded p-2 border border-slate-700/40 overflow-auto max-h-40 whitespace-pre-wrap break-words"
        >
          {text}
        </div>
      )}
    </div>
  );
});
