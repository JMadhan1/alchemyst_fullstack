'use client';

/**
 * SessionExport.tsx — Export full session trace as JSON.
 * Useful for debugging and submitting evidence of protocol compliance.
 */

import React, { memo, useCallback } from 'react';
import { useAgentStore } from '@/src/store/agentStore';
import { metrics } from '@/src/lib/metricsTracker';

export const SessionExport = memo(function SessionExport() {
  const timelineEvents = useAgentStore((s) => s.timelineEvents);
  const messages = useAgentStore((s) => s.messages);
  const contextSnapshots = useAgentStore((s) => s.contextSnapshots);

  const handleExport = useCallback(() => {
    const snapshot = metrics.getSnapshot();
    const export_data = {
      exportedAt: new Date().toISOString(),
      metrics: snapshot,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        textLength: m.text.length,
        toolCalls: m.toolCalls,
        isStreaming: m.isStreaming,
        createdAt: m.createdAt,
      })),
      timelineEvents,
      contextSnapshots: Object.fromEntries(contextSnapshots),
    };

    const blob = new Blob([JSON.stringify(export_data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-console-session-${Date.now()}.json`;
    // Must be in the DOM for Firefox + Safari; delay revoke so browser has time to
    // initiate the download before the object URL is invalidated.
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }, [timelineEvents, messages, contextSnapshots]);

  return (
    <button
      onClick={handleExport}
      className="text-xs font-mono px-2 py-1 rounded transition-colors"
      style={{
        background: '#0a0a0f',
        border: '1px solid #1e1e2e',
        color: '#64748b',
      }}
      title="Export full session trace as JSON"
    >
      ↓ Export
    </button>
  );
});
