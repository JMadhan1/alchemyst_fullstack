/**
 * jsonDiff.ts — Shallow JSON diff algorithm.
 *
 * Compares two flat-or-nested JSON objects at the top level.
 * For each key, determines if it was added, removed, changed, or unchanged.
 * Nested objects are compared by reference equality at this level — callers
 * can recurse for deeper diffs (JsonDiffTree does this for rendering).
 */

import type { DiffResult } from '@/src/types';

export function diffJson(
  prev: Record<string, unknown>,
  next: Record<string, unknown>
): DiffResult {
  const result: DiffResult = {
    added: {},
    removed: {},
    changed: {},
    unchanged: {},
  };

  const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);

  for (const key of allKeys) {
    const inPrev = Object.prototype.hasOwnProperty.call(prev, key);
    const inNext = Object.prototype.hasOwnProperty.call(next, key);

    if (!inPrev && inNext) {
      result.added[key] = next[key];
    } else if (inPrev && !inNext) {
      result.removed[key] = prev[key];
    } else if (inPrev && inNext) {
      if (!deepEqual(prev[key], next[key])) {
        result.changed[key] = { from: prev[key], to: next[key] };
      } else {
        result.unchanged[key] = next[key];
      }
    }
  }

  return result;
}

/**
 * Deep equality check for JSON-serialisable values.
 * Uses JSON.stringify as a simple structural comparison.
 * For production at scale you'd use a proper traversal to avoid O(n) string
 * allocation, but this is correct for all valid JSON types.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  // For objects/arrays: stringify comparison
  if (typeof a === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}
