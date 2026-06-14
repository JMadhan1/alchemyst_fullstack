'use client';

/**
 * StreamingText.tsx — Renders accumulated token text.
 *
 * Key invariants:
 * - Uses CSS min-height to prevent layout shift when a ToolCallCard appears
 * - text prop only grows; never shrinks mid-stream
 * - Frozen when isStreaming=false (STREAM_END or TOOL_CALL interruption)
 */

import React, { memo } from 'react';

interface StreamingTextProps {
  text: string;
  isStreaming: boolean;
}

export const StreamingText = memo(function StreamingText({
  text,
  isStreaming,
}: StreamingTextProps) {
  return (
    <div
      style={{
        fontFamily: 'monospace',
        fontSize: '13px',
        lineHeight: '1.65',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        color: 'var(--text-1)',
        // Prevent layout shift when ToolCallCard appears below
        minHeight: text ? undefined : '1.5rem',
      }}
    >
      {text}
      {isStreaming && (
        <span
          className="cursor-blink"
          aria-label="streaming"
          style={{
            display: 'inline-block',
            width: '2px',
            height: '14px',
            background: '#4f8ef7',
            marginLeft: '2px',
            verticalAlign: 'text-bottom',
            borderRadius: '1px',
          }}
        />
      )}
    </div>
  );
});
