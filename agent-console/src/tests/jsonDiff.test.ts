/**
 * jsonDiff.test.ts — Unit tests for the JSON diff algorithm.
 */

import { diffJson } from '../lib/jsonDiff';

describe('diffJson', () => {
  test('added key', () => {
    const prev = { a: 1 };
    const next = { a: 1, b: 2 };
    const result = diffJson(prev, next);

    expect(result.added).toEqual({ b: 2 });
    expect(result.removed).toEqual({});
    expect(result.changed).toEqual({});
    expect(result.unchanged).toEqual({ a: 1 });
  });

  test('removed key', () => {
    const prev = { a: 1, b: 2 };
    const next = { a: 1 };
    const result = diffJson(prev, next);

    expect(result.added).toEqual({});
    expect(result.removed).toEqual({ b: 2 });
    expect(result.changed).toEqual({});
    expect(result.unchanged).toEqual({ a: 1 });
  });

  test('changed value', () => {
    const prev = { a: 1, b: 'hello' };
    const next = { a: 1, b: 'world' };
    const result = diffJson(prev, next);

    expect(result.added).toEqual({});
    expect(result.removed).toEqual({});
    expect(result.changed).toEqual({ b: { from: 'hello', to: 'world' } });
    expect(result.unchanged).toEqual({ a: 1 });
  });

  test('nested diff — nested object change detected', () => {
    const prev = { config: { debug: false, timeout: 30 }, name: 'app' };
    const next = { config: { debug: true, timeout: 30 }, name: 'app' };
    const result = diffJson(prev, next);

    // Top-level config key changed (nested objects differ)
    expect(Object.keys(result.changed)).toContain('config');
    expect(result.changed['config']).toEqual({
      from: { debug: false, timeout: 30 },
      to: { debug: true, timeout: 30 },
    });
    expect(result.unchanged).toEqual({ name: 'app' });
  });

  test('empty objects → no diffs', () => {
    const result = diffJson({}, {});

    expect(result.added).toEqual({});
    expect(result.removed).toEqual({});
    expect(result.changed).toEqual({});
    expect(result.unchanged).toEqual({});
  });

  test('identical objects → all unchanged', () => {
    const obj = { x: 1, y: 'hello', z: [1, 2, 3] };
    const result = diffJson(obj, { ...obj, z: [1, 2, 3] });

    expect(result.added).toEqual({});
    expect(result.removed).toEqual({});
    expect(result.changed).toEqual({});
    expect(Object.keys(result.unchanged)).toContain('x');
    expect(Object.keys(result.unchanged)).toContain('y');
    expect(Object.keys(result.unchanged)).toContain('z');
  });

  test('null value in both — unchanged', () => {
    const prev = { a: null };
    const next = { a: null };
    const result = diffJson(
      prev as Record<string, unknown>,
      next as Record<string, unknown>
    );
    expect(result.unchanged).toEqual({ a: null });
  });

  test('null to value — changed', () => {
    const prev = { a: null } as Record<string, unknown>;
    const next = { a: 42 } as Record<string, unknown>;
    const result = diffJson(prev, next);
    expect(result.changed['a']).toEqual({ from: null, to: 42 });
  });

  test('multiple operations at once', () => {
    const prev = { keep: 1, change: 'old', remove: true };
    const next = { keep: 1, change: 'new', add: 99 };
    const result = diffJson(prev, next);

    expect(result.unchanged).toEqual({ keep: 1 });
    expect(result.changed['change']).toEqual({ from: 'old', to: 'new' });
    expect(result.removed).toEqual({ remove: true });
    expect(result.added).toEqual({ add: 99 });
  });

  test('array values — same array = unchanged', () => {
    const arr = [1, 2, 3];
    const result = diffJson({ a: arr }, { a: [1, 2, 3] });
    expect(result.unchanged).toHaveProperty('a');
    expect(Object.keys(result.changed)).toHaveLength(0);
  });

  test('array values — different array = changed', () => {
    const result = diffJson({ a: [1, 2] }, { a: [1, 2, 3] });
    expect(result.changed).toHaveProperty('a');
    expect(result.changed['a']).toEqual({ from: [1, 2], to: [1, 2, 3] });
  });
});
