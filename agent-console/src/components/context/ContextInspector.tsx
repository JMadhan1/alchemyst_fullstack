'use client';

/**
 * ContextInspector.tsx — Left panel for context snapshots.
 *
 * Shows current context_id, diffs between snapshots, and a history scrubber.
 */

import React, { memo, useState, useMemo } from 'react';
import { useAgentStore } from '@/src/store/agentStore';
import { JsonDiffTree } from './JsonDiffTree';
import { ContextScrubber } from './ContextScrubber';
import type { ContextSnapshot } from '@/src/types';

export const ContextInspector = memo(function ContextInspector() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const contextSnapshots = useAgentStore((s) => s.contextSnapshots);
  const activeContextId = useAgentStore((s) => s.activeContextId);
  const setActiveContextId = useAgentStore((s) => s.setActiveContextId);

  const [scrubberIndex, setScrubberIndex] = useState<number>(0);
  // Follow the newest snapshot (and its diff) until the user manually scrubs.
  const [followLatest, setFollowLatest] = useState<boolean>(true);

  const snapshots: ContextSnapshot[] = useMemo(() => {
    if (!activeContextId) return [];
    return contextSnapshots.get(activeContextId) ?? [];
  }, [contextSnapshots, activeContextId]);

  const latestIndex = Math.max(0, snapshots.length - 1);
  const effectiveIndex = followLatest ? latestIndex : Math.min(scrubberIndex, latestIndex);

  const handleScrub = (i: number) => {
    setFollowLatest(false);
    setScrubberIndex(i);
  };

  const currentSnapshot = snapshots[effectiveIndex];
  const previousSnapshot = effectiveIndex > 0 ? snapshots[effectiveIndex - 1] : null;

  const contextIds = useMemo(
    () => Array.from(contextSnapshots.keys()),
    [contextSnapshots]
  );

  if (isCollapsed) {
    return (
      <div
        onClick={() => setIsCollapsed(false)}
        title="Expand context inspector"
        style={{
          width: 32,
          background: 'var(--bg-panel)',
          borderRight: '1px solid var(--border)',
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
            textOrientation: 'mixed',
            textTransform: 'uppercase',
          }}
        >
          CTX
        </span>
        {contextIds.length > 0 && (
          <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-3)' }}>
            {contextIds.length}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        width: 280,
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border)',
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
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="1" y="1" width="10" height="10" rx="2" stroke="#a78bfa" strokeWidth="1" fill="rgba(167,139,250,0.08)" />
            <line x1="1" y1="4" x2="11" y2="4" stroke="#a78bfa" strokeWidth="0.7" opacity="0.5" />
            <line x1="4" y1="1" x2="4" y2="11" stroke="#a78bfa" strokeWidth="0.7" opacity="0.5" />
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
            Context
          </span>
          {activeContextId && (
            <span
              style={{
                fontSize: '9px',
                fontFamily: 'monospace',
                color: '#a78bfa',
                background: 'var(--purple-dim)',
                border: '1px solid #3b1f7a',
                borderRadius: 3,
                padding: '0 5px',
                maxWidth: 80,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={activeContextId}
            >
              {activeContextId.slice(0, 10)}…
            </span>
          )}
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
          title="Collapse context inspector"
        >
          ◀
        </button>
      </div>

      {/* ── Context ID selector ── */}
      {contextIds.length > 1 && (
        <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: '9px', color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: 'monospace' }}>
            context_id
          </div>
          <select
            style={{
              width: '100%',
              fontSize: '10px',
              fontFamily: 'monospace',
              background: 'var(--bg-base)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--text-1)',
              padding: '3px 6px',
              outline: 'none',
            }}
            value={activeContextId ?? ''}
            onChange={(e) => { setActiveContextId(e.target.value); setFollowLatest(true); setScrubberIndex(0); }}
          >
            {contextIds.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Snapshot metadata ── */}
      {currentSnapshot ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 12px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: '9px', fontFamily: 'monospace', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>seq</span>
          <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#a78bfa', fontWeight: 700 }}>#{currentSnapshot.seq}</span>
          <span style={{ fontSize: '9px', fontFamily: 'monospace', color: 'var(--text-3)', marginLeft: 'auto' }}>
            {new Date(currentSnapshot.timestamp).toLocaleTimeString('en-US', { hour12: false })}
          </span>
        </div>
      ) : null}

      {/* ── Diff legend ── */}
      {previousSnapshot && (
        <div
          style={{
            display: 'flex',
            gap: 12,
            padding: '4px 12px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: '9px', fontFamily: 'monospace', color: '#10d9a0' }}>+ added</span>
          <span style={{ fontSize: '9px', fontFamily: 'monospace', color: '#f87171', textDecoration: 'line-through' }}>removed</span>
          <span style={{ fontSize: '9px', fontFamily: 'monospace', color: '#f59e0b' }}>~ changed</span>
        </div>
      )}

      {/* ── JSON Tree ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
        {currentSnapshot ? (
          <JsonDiffTree
            current={currentSnapshot.data}
            previous={previousSnapshot?.data ?? null}
          />
        ) : (
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
              <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1" />
              <line x1="3" y1="8" x2="21" y2="8" stroke="currentColor" strokeWidth="0.8" />
              <line x1="8" y1="3" x2="8" y2="21" stroke="currentColor" strokeWidth="0.8" />
            </svg>
            <span style={{ fontSize: '10px', fontFamily: 'monospace' }}>No context snapshots</span>
          </div>
        )}
      </div>

      {/* ── Scrubber ── */}
      <ContextScrubber
        snapshots={snapshots}
        currentIndex={effectiveIndex}
        onIndexChange={handleScrub}
      />
    </div>
  );
});
