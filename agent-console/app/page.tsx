'use client';

/**
 * page.tsx — Agent Console root page.
 *
 * 3-column layout:
 *   Left  (280px, collapsible): ContextInspector
 *   Center (flex-1, min 400px): ChatPanel
 *   Right  (320px, collapsible): TraceTimeline
 *
 * MetricsBar sits below the header — live protocol compliance score,
 * token rate, ping latency, and chaos event detection.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ChatPanel } from '@/src/components/chat/ChatPanel';
import { TraceTimeline } from '@/src/components/timeline/TraceTimeline';
import { ContextInspector } from '@/src/components/context/ContextInspector';
import { ConnectionIndicator } from '@/src/components/connection/ConnectionIndicator';
import { MetricsBar } from '@/src/components/connection/MetricsBar';
import { SessionExport } from '@/src/components/connection/SessionExport';
import { useWebSocket } from '@/src/hooks/useWebSocket';
import { useAgentStore } from '@/src/store/agentStore';

const WS_URL = 'ws://localhost:4747/ws';

function Uptime({ since }: { since: number | null }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!since) return;
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - since) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [since]);
  if (!since) return null;
  const h = Math.floor(elapsed / 3600).toString().padStart(2, '0');
  const m = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
  const s = (elapsed % 60).toString().padStart(2, '0');
  return (
    <span className="text-xs font-mono" style={{ color: '#334155' }}>
      UP {h}:{m}:{s}
    </span>
  );
}

export default function AgentConsolePage() {
  const connectionState = useAgentStore((s) => s.connectionState);
  const addUserMessage = useAgentStore((s) => s.addUserMessage);
  const setLastRenderedSeq = useAgentStore((s) => s.setLastRenderedSeq);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);

  // Capture the wall-clock instant of the first live connection so the header
  // can show session uptime. This is an intentional transition-capture: the
  // updater is a no-op once set (prev ?? …) and only clears on a full teardown,
  // so it cannot cascade renders.
  useEffect(() => {
    if (connectionState === 'CONNECTED' || connectionState === 'STREAMING' || connectionState === 'TOOL_CALL_PENDING') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConnectedAt((prev) => prev ?? Date.now());
    } else if (connectionState === 'IDLE' || connectionState === 'CLOSED') {
      setConnectedAt(null);
    }
  }, [connectionState]);

  const { connect, disconnect, send, beginTurn, notifyRendered } = useWebSocket(WS_URL);

  const handleSendMessage = useCallback(
    (content: string) => {
      addUserMessage(content);
      // Reset client seq tracking BEFORE the message goes out — the server
      // restarts its seq counter at 0 for every turn.
      beginTurn();
      send({ type: 'USER_MESSAGE', content });
    },
    [addUserMessage, beginTurn, send]
  );

  const handleRendered = useCallback(
    (seq: number) => {
      setLastRenderedSeq(seq);
      notifyRendered(seq);
    },
    [setLastRenderedSeq, notifyRendered]
  );

  // Also disable during RECONNECTING/RESUMING — messages sent then are silently
  // dropped because the socket is closed. "Remains interactive" means read/scroll,
  // not send. Re-enable once CONNECTED so the user can pick up naturally.
  const chatDisabled =
    connectionState === 'IDLE' ||
    connectionState === 'CLOSED' ||
    connectionState === 'CONNECTING' ||
    connectionState === 'RECONNECTING' ||
    connectionState === 'RESUMING';

  const isReconnecting = connectionState === 'RECONNECTING' || connectionState === 'RESUMING';

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-base)' }}>

      {/* ── Top header ── */}
      <header
        className="flex items-center justify-between px-4 flex-shrink-0"
        style={{
          background: 'linear-gradient(180deg, #0f0f1a 0%, #0d0d14 100%)',
          borderBottom: '1px solid var(--border)',
          height: '48px',
          position: 'relative',
        }}
      >
        {/* Left accent line */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '2px',
            background: 'linear-gradient(180deg, #4f8ef7 0%, #a78bfa 100%)',
          }}
        />

        <div className="flex items-center gap-4 pl-2">
          {/* Logo mark */}
          <div className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <polygon
                points="10,1 18.66,5.5 18.66,14.5 10,19 1.34,14.5 1.34,5.5"
                stroke="#4f8ef7"
                strokeWidth="1.2"
                fill="rgba(79,142,247,0.08)"
              />
              <polygon
                points="10,5 15.19,7.75 15.19,13.25 10,16 4.81,13.25 4.81,7.75"
                fill="rgba(167,139,250,0.12)"
                stroke="#a78bfa"
                strokeWidth="0.8"
              />
              <circle cx="10" cy="10" r="1.5" fill="#4f8ef7" />
            </svg>
            <span
              className="text-sm font-mono font-bold tracking-widest"
              style={{ color: '#e8eaf6', letterSpacing: '0.15em' }}
            >
              AGENT CONSOLE
            </span>
          </div>

          {/* Divider */}
          <div className="w-px h-5" style={{ background: 'var(--border)' }} />

          {/* Endpoint */}
          <div className="flex items-center gap-1.5">
            <span style={{ color: 'var(--text-3)', fontSize: '10px', letterSpacing: '0.06em' }}>WS</span>
            <span className="text-xs font-mono" style={{ color: '#3d4f6b' }}>
              {WS_URL}
            </span>
          </div>

          <Uptime since={connectedAt} />
        </div>

        <div className="flex items-center gap-3">
          <SessionExport />
          <ConnectionIndicator
            state={connectionState}
            onConnect={connect}
            onDisconnect={disconnect}
          />
        </div>
      </header>

      {/* ── Live metrics bar ── */}
      <MetricsBar />

      {/* ── Reconnect banner (non-blocking, above columns) ── */}
      {isReconnecting && (
        <div
          className="shimmer w-full flex items-center justify-center gap-2 px-4 py-1 text-xs font-mono flex-shrink-0"
          style={{
            background: '#140e00',
            color: '#f59e0b',
            borderBottom: '1px solid rgba(245,158,11,0.1)',
          }}
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span>
            {connectionState === 'RECONNECTING' ? 'Reconnecting with exponential backoff' : 'Resuming session from last_seq'}
          </span>
          <span style={{ color: '#4a3600' }}>— chat and timeline remain interactive</span>
        </div>
      )}

      {/* ── Main 3-column layout ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Context Inspector */}
        <ContextInspector />

        {/* Center: Chat */}
        <main className="flex-1 overflow-hidden" style={{ minWidth: '400px' }}>
          <ChatPanel
            onSendMessage={handleSendMessage}
            onRendered={handleRendered}
            disabled={chatDisabled}
            connectionState={connectionState}
          />
        </main>

        {/* Right: Trace Timeline */}
        <TraceTimeline />
      </div>
    </div>
  );
}
