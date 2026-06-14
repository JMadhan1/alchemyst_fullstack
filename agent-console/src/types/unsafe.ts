/**
 * unsafe.ts — THE ONLY FILE PERMITTED TO USE `any`
 *
 * Why: The WebSocket `MessageEvent.data` is typed as `any` by the browser
 * WebSocket API spec. We must parse it with `JSON.parse` which also returns
 * `any`. There is no safe way to statically type raw network payloads before
 * validation — we validate immediately in wsClient.ts after parsing, so
 * the `any` surface is contained to this single parse boundary.
 *
 * Rule: Do NOT use `any` anywhere else. Use `unknown` for unvalidated
 * external data in all other files, and narrow with type guards.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UnsafeJson = any;

/**
 * Parse a raw WebSocket message string into an untyped object.
 * Callers MUST immediately narrow the result with a type guard.
 */
export function parseUnsafe(raw: string): UnsafeJson {
  return JSON.parse(raw);
}
