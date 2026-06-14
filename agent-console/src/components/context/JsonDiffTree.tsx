'use client';

/**
 * JsonDiffTree.tsx — Recursive diff-highlighted JSON tree.
 *
 * Features:
 * - Added keys: green background
 * - Removed keys: red strikethrough
 * - Changed keys: yellow highlight, shows from→to
 * - Unchanged: dim
 * - Values > 500KB: lazy expand (don't render until clicked)
 * - Only visible nodes rendered (intersection observer based virtualization)
 */

import React, { memo, useState, useRef, useEffect } from 'react';
import type { DiffResult } from '@/src/types';
import { diffJson } from '@/src/lib/jsonDiff';

const SIZE_THRESHOLD = 500 * 1024; // 500KB in chars

function estimateSize(v: unknown): number {
  try {
    return JSON.stringify(v)?.length ?? 0;
  } catch {
    return 0;
  }
}

function isObjectOrArray(v: unknown): v is Record<string, unknown> | unknown[] {
  return typeof v === 'object' && v !== null;
}

function toRecord(v: unknown): Record<string, unknown> {
  if (Array.isArray(v)) {
    return Object.fromEntries(v.map((item, i) => [String(i), item]));
  }
  if (typeof v === 'object' && v !== null) {
    return v as Record<string, unknown>;
  }
  return {};
}

type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged' | 'none';

interface DiffNodeProps {
  keyName: string;
  value: unknown;
  status: DiffStatus;
  changedFrom?: unknown;
  depth: number;
  diffPrev?: Record<string, unknown>;
}

const DiffNode = memo(function DiffNode({
  keyName,
  value,
  status,
  changedFrom,
  depth,
  diffPrev,
}: DiffNodeProps) {
  const isLarge = estimateSize(value) > SIZE_THRESHOLD;
  const isExpandable = isObjectOrArray(value);
  const [expanded, setExpanded] = useState(depth < 2 && !isLarge);
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(depth === 0);

  // Intersection observer for virtualization of deep nodes
  useEffect(() => {
    if (depth === 0) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setVisible(true);
      },
      { threshold: 0.01 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [depth]);

  const bgColor: string = {
    added: 'rgba(16,185,129,0.08)',
    removed: 'rgba(239,68,68,0.08)',
    changed: 'rgba(234,179,8,0.08)',
    unchanged: 'transparent',
    none: 'transparent',
  }[status];

  const textColor: string = {
    added: '#10b981',
    removed: '#ef4444',
    changed: '#eab308',
    unchanged: '#94a3b8',
    none: '#94a3b8',
  }[status];

  const displayValue =
    isExpandable ? null : String(value === null ? 'null' : value);

  return (
    <div
      ref={ref}
      style={{
        paddingLeft: depth > 0 ? `${depth * 12}px` : 0,
        background: bgColor,
        borderRadius: '2px',
        marginBottom: '1px',
      }}
    >
      {visible ? (
        <div className="flex items-start gap-1 min-h-5 py-0.5">
          {isExpandable && (
            <button
              className="text-slate-500 hover:text-slate-300 text-xs w-4 flex-shrink-0 font-mono"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? '▾' : '▸'}
            </button>
          )}
          {!isExpandable && <span className="w-4 flex-shrink-0" />}

          <span className="font-mono text-xs text-slate-400 flex-shrink-0">{keyName}:</span>

          {!isExpandable && (
            <span
              className={`font-mono text-xs break-all ${
                status === 'removed' ? 'line-through opacity-60' : ''
              }`}
              style={{ color: textColor }}
            >
              {displayValue}
            </span>
          )}

          {status === 'changed' && !isExpandable && changedFrom !== undefined && (
            <span className="font-mono text-xs text-slate-600 ml-1">
              ← {String(changedFrom)}
            </span>
          )}

          {isExpandable && !expanded && (
            <span className="font-mono text-xs text-slate-600">
              {Array.isArray(value) ? `[${(value as unknown[]).length}]` : `{${Object.keys(toRecord(value)).length}}`}
              {isLarge && (
                <span className="ml-1 text-amber-600">⚠ large</span>
              )}
            </span>
          )}
        </div>
      ) : (
        <div style={{ height: '20px' }} />
      )}

      {visible && isExpandable && expanded && (
        <ExpandedChildren
          value={toRecord(value)}
          depth={depth + 1}
          diffPrev={
            status === 'changed' && changedFrom !== undefined
              ? toRecord(changedFrom)
              : diffPrev
          }
        />
      )}
    </div>
  );
});

interface ExpandedChildrenProps {
  value: Record<string, unknown>;
  depth: number;
  diffPrev?: Record<string, unknown>;
}

const ExpandedChildren = memo(function ExpandedChildren({
  value,
  depth,
  diffPrev,
}: ExpandedChildrenProps) {
  const diff: DiffResult | null = diffPrev ? diffJson(diffPrev, value) : null;

  return (
    <>
      {Object.entries(value).map(([k, v]) => {
        let status: DiffStatus = 'none';
        let changedFrom: unknown;

        if (diff) {
          if (k in diff.added) status = 'added';
          else if (k in diff.removed) status = 'removed';
          else if (k in diff.changed) {
            status = 'changed';
            changedFrom = diff.changed[k]?.from;
          } else {
            status = 'unchanged';
          }
        }

        return (
          <DiffNode
            key={k}
            keyName={k}
            value={v}
            status={status}
            changedFrom={changedFrom}
            depth={depth}
            diffPrev={
              diff && status === 'unchanged' && diffPrev && isObjectOrArray(v)
                ? toRecord(diffPrev[k] ?? {})
                : undefined
            }
          />
        );
      })}
    </>
  );
});

// ─── Public component ─────────────────────────────────────────────────────────

interface JsonDiffTreeProps {
  current: Record<string, unknown>;
  previous: Record<string, unknown> | null;
}

export const JsonDiffTree = memo(function JsonDiffTree({
  current,
  previous,
}: JsonDiffTreeProps) {
  const diff = previous ? diffJson(previous, current) : null;

  return (
    <div className="font-mono text-xs overflow-auto">
      {Object.entries(current).map(([k, v]) => {
        let status: DiffStatus = 'none';
        let changedFrom: unknown;

        if (diff) {
          if (k in diff.added) status = 'added';
          else if (k in diff.removed) status = 'removed';
          else if (k in diff.changed) {
            status = 'changed';
            changedFrom = diff.changed[k]?.from;
          } else {
            status = 'unchanged';
          }
        }

        return (
          <DiffNode
            key={k}
            keyName={k}
            value={v}
            status={status}
            changedFrom={changedFrom}
            depth={0}
            diffPrev={
              previous && isObjectOrArray(v) && isObjectOrArray(previous[k])
                ? toRecord(previous[k])
                : undefined
            }
          />
        );
      })}
      {/* Show removed keys from previous that are absent in current */}
      {diff &&
        Object.entries(diff.removed).map(([k, v]) => (
          <DiffNode
            key={`removed-${k}`}
            keyName={k}
            value={v}
            status="removed"
            depth={0}
          />
        ))}
    </div>
  );
});
