# Architecture Decision Record — Agent Console

## 1. SeqBuffer Data Structure: `Map<number, ServerMessage>`

**Decision:** Use a `Map<number, ServerMessage>` as the pending message buffer, keyed by seq number.

**Why:** O(1) lookup, insertion, and deletion by seq key. This is the dominant operation — on every message we check if `nextExpected` is in the buffer (drain loop). A sorted array would require O(n) scanning or binary search. A plain object would work but Map gives clean iteration semantics and explicit key typing. Memory is bounded by the gap between `nextExpected` and the highest seq received; in practice this is ≤ a few dozen messages even under network jitter.

**Alternative considered:** Min-heap for optimal drain. Rejected because the drain loop already achieves O(k) where k is the number of consecutive messages available — the Map lookup per step is O(1), and we only drain when the sequence is contiguous. A heap adds implementation complexity without measurable benefit at the concurrency levels in this protocol.

---

## 2. `lastRenderedSeq` vs `lastReceivedSeq`

**Decision:** Track both, but send only `lastRenderedSeq` in the RESUME message.

**Why this distinction matters critically for correctness:**

`lastReceivedSeq` is updated the moment a message arrives from the network. `lastRenderedSeq` is updated only after the React render cycle commits and the content is visibly in the DOM (via `useEffect` + ref after the commit phase).

If we sent `lastReceivedSeq` in RESUME:
- The client might have received seq 50 but only rendered seq 42 (the rest are queued in React's batch queue or in the SeqBuffer)
- The server replays from seq 50 — but the client has never shown the user seq 43–49
- The user sees a permanent gap in the conversation

`lastRenderedSeq` guarantees: "everything up to this seq is visible on screen." The server's replay starts from there, and `SeqBuffer` deduplicates any messages the client already has in-flight.

**Implementation:** `WSClient.setLastRenderedSeq()` is called by the store's `setLastRenderedSeq` action, which is triggered in a `useEffect` after the MessageBubble renders — after the browser has painted.

---

## 3. CSS Strategy to Prevent Layout Shift on Tool Call Interruption

**Decision:** Use `min-height` on `StreamingText` and keep the ToolCallCard container in the DOM structure always (rendered as an empty div when there are no tool calls).

**Why:** When a TOOL_CALL message arrives mid-stream:
1. The streaming text freezes (the cursor blink stops, no new tokens append)
2. A ToolCallCard slides in below the text

Without `min-height`, if the text div has zero height (empty stream start), the card appearing causes a layout shift that jumps the scroll position. `min-height: 1.5rem` on the text container ensures the containing block is stable even before the first token arrives.

Additionally, we never animate the text div's height — only the card border color transitions (amber → green), which is composited on the GPU and causes no reflow.

---

## 4. Zustand over Redux / Context

**Decision:** Zustand with Immer middleware.

**Why Zustand over Redux:**
- Zero boilerplate. No action creators, no reducers, no `connect()`. The store is a typed hook — components select slices directly.
- Immer middleware gives safe immutable updates for the nested state (Map of streams, array of messages) without spread hell.
- Zustand's subscription model is fine-grained: `useAgentStore(s => s.messages)` only re-renders when `messages` reference changes, not on every store update. This is critical for the timeline — we don't want the chat to re-render on timeline events.
- Bundle size: Zustand is ~3KB gzipped. Redux Toolkit adds ~12KB.

**Why Zustand over React Context:**
- Context re-renders every consumer on any value change. Even with `useMemo`, wrapping a Map inside context causes all consumers to re-render whenever any Map entry changes. Under high token throughput (100 tokens/sec) this would peg the CPU.
- Zustand uses a pub-sub model: only components that subscribe to the changed slice re-render.

**Immer choice:** The store has nested mutable state — `Map<string, StreamState>`, `ChatMessage[]` with nested `ToolCallEntry[]`. Immer lets us write `msg.text += token` instead of spreading every level. The Immer overhead per mutation is negligible vs. the React render cycle cost.

---

## 5. What Changes for 50 Concurrent Agent Streams

With 50 simultaneous streams (operations dashboard use case):

**Store:** The `activeStreams` Map and `messages` array need to be partitioned by agent ID. Currently a flat array; at 50 streams with 200 messages each, that's 10,000 messages — still renderable with virtualization but the store update path (`addToken`) touches a linear scan. Fix: index messages by stream_id for O(1) token append.

**Timeline:** At 100 tokens/sec × 50 agents = 5,000 events/sec. The 50ms debounce on timeline updates is no longer sufficient — switch to a ring buffer that caps timeline history at 10,000 events and only flushes to React state at 100ms intervals (10 FPS for the timeline, which is visually fine).

**React rendering:** Each stream gets its own `StreamingText` component. React.memo ensures only the component for the active stream re-renders per token. With 50 streams, the 49 inactive ones are fully memoized.

**WebSocket:** One WSClient instance per agent stream, or multiplex via a single connection with stream_id routing. The protocol as designed supports the latter (every message has stream_id).

**SeqBuffer:** One SeqBuffer per connection — already handles this correctly.

---

## 6. What Changes for 100x Longer Responses (Document Generation)

With responses of 500,000+ tokens (generating a 400-page document):

**ChatPanel:** The message's `text` string grows to several MB. String concatenation via `+=` is O(n) in JS — switch to a `string[]` chunk array, join on render, and memoize the join behind a ref that only updates when the array length changes (not on every token).

**StreamingText:** DOM text node rendering of a 1MB string causes significant browser paint cost. Solution: chunked virtual rendering — only render the last N paragraphs of the text in the DOM, with a "scroll to start" affordance for history.

**Timeline:** Token batching groups all consecutive tokens into one row — this already handles long documents. The batch shows "Streamed 50,000 tokens (42.3s)".

**Context snapshots:** Already handled via lazy expand + intersection observer virtualization. No change needed.

**Memory:** A single 500K-token response accumulates ~2MB of text in the store. This is fine. If responses are routinely multi-MB, move historical messages out of the hot store into an IndexedDB archive after the stream ends, keeping only the last N visible messages in memory.

---

## 7. THE PROTOCOL BUG: TOOL_ACK Race Condition

**Documented bug in the protocol:**

### Scenario 0 (the real, reproducible one): reorder-buffer ↔ ack-wait deadlock

This is the failure mode the brief alludes to, and it is **unavoidable by any client**. Confirmed by running `npm run verify` against `--mode chaos`: roughly 1 in ~6 sessions logs a `TOOL_ACK_TIMEOUT` violation that no client behaviour can prevent.

Mechanism, reading the server against itself:

1. `runScript` sends the `TOOL_CALL` through `sendMessage()`, which in chaos mode passes it to `ChaosEngine.process()`.
2. With `reorderProbability` (~0.15–0.35), `process()` pushes the `TOOL_CALL` into a 4-slot reorder buffer and returns `{ messages: [] }` — **the TOOL_CALL is never transmitted**.
3. The very next line is `await this.waitForAck(callId)`, a 5-second blocking wait.
4. While blocked, the script loop emits nothing, so no later message arrives to flush the reorder buffer. The client cannot acknowledge a frame it has not received.
5. At 5 s the server logs `TOOL_ACK_TIMEOUT` (verdict `violation`) and proceeds; the subsequent `TOOL_RESULT` finally flushes the buffer and delivers the stale `TOOL_CALL`.

The root cause is that the server treats `TOOL_ACK` as a synchronous barrier **after** handing the message to a component that may delay or withhold it — coupling liveness (the 5 s deadline) to a buffer the client has no visibility into. The client side is already maximally defensive: `TOOL_ACK` is sent out-of-band the instant the frame arrives (§9), so the *only* way to miss the deadline is for the frame to never arrive.

**Protocol fix (server-side):** start the ack-timeout clock from the moment the frame is actually flushed to the socket, not from `sendMessage()`; or exempt `TOOL_CALL` from reorder buffering; or make `TOOL_ACK` advisory rather than a blocking barrier. **Client-side mitigation:** none possible — documented so the behaviour isn't mistaken for a client bug during evaluation.

### Scenario A: ACK sent, connection drops before server receives it

1. Client receives TOOL_CALL for `call_id: "abc"`
2. Client sends TOOL_ACK `{ call_id: "abc" }` — the message is in the TCP send buffer
3. Connection drops — the ACK never reaches the server
4. Server logs a "TOOL_ACK timeout" protocol violation after 5 seconds
5. Server sends TOOL_RESULT anyway (the tool ran server-side)
6. Client reconnects, sends RESUME, server replays TOOL_RESULT
7. **Client receives TOOL_RESULT for `call_id: "abc"` — but it has no matching pending TOOL_CALL in its state (the pending entry was already in the store from before the drop)**

**Fix (implemented):** `resolveToolCall` in the store is idempotent — if `tc.status === 'resolved'`, it's a no-op. The TOOL_RESULT is processed silently. `ToolCallCard` stays in its final resolved state.

### Scenario B: reconnect + replayed TOOL_CALL → duplicate ACK

1. Client receives TOOL_CALL for `call_id: "xyz"`, ACKs it
2. Connection drops; client reconnects and sends RESUME
3. Server replays TOOL_CALL + TOOL_RESULT from history
4. **Naively, the client would re-process the replayed TOOL_CALL and send a *second* ACK — which the server scores as `unexpected` (the call is no longer pending)**

**Fix (implemented):** TOOL_ACK is sent **out-of-band and deduplicated by `call_id`** (`WSClient.respondControl` + the `ackedCallIds` set). The first delivery of a `call_id` is acked exactly once; every subsequent delivery — duplicate frame or post-reconnect replay — is a no-op. The same pattern guards `PONG` via `respondedPingSeqs` keyed on `seq`. This replaced an earlier `setTimeout`-per-call design, which both risked the 5 s deadline under reordering and could fire a late ACK after the call had resolved.

Scenario A's defence still stands independently: `resolveToolCall` in the store is idempotent, so a replayed TOOL_RESULT for an already-resolved call is silently absorbed.

**Protocol recommendation:** The server should treat late/duplicate TOOL_ACKs as idempotent rather than logging them, since reordering makes the race unavoidable — but the client no longer depends on that leniency.

---

## 8. Per-Turn Seq Reset — the multi-turn correctness fix

**Decision:** `WSClient.beginTurn()` resets all per-turn seq state (`SeqBuffer`, `processedSeqs`, the two control-dedup sets, and the rendered/received markers) immediately before each `USER_MESSAGE` is sent.

**Why it is mandatory, not cosmetic:** the server does `this.seq = 0; this.eventHistory = []` on every `USER_MESSAGE`. So turn 2's stream restarts at `seq 1`. A client that carries `nextExpected`/`processedSeqs` across turns would see those low seqs as "already processed" and drop the **entire** second response — the user message bubble appears, but no assistant reply ever renders. The bug is invisible on a single-shot demo and total on the second message.

**Why it must NOT fire on reconnect:** within a turn the server keeps numbering monotonically and replays from history on RESUME. Reconnect therefore preserves seq state (so replayed-but-already-rendered events dedup correctly); only a genuine new user turn resets it. `beginTurn` is wired through `useWebSocket` → `handleSendMessage`, never through the reconnect path.

Covered by `wsClient.test.ts` ("renders a second turn whose seq counter restarts at 1", plus a negative test proving the drop without the reset) and by the live `npm run verify` pass (6/6 turns render tokens).

---

## 9. Out-of-Band Control Responses vs. Ordered Rendering

**Decision:** Split message handling into two lanes. Protocol-critical replies (`PONG`, `TOOL_ACK`) are produced in `respondControl()` the moment a frame arrives — before the reorder buffer. Everything else (and the *rendering* of PING/TOOL_CALL into the timeline) flows through `SeqBuffer` in strict seq order.

**Why:** PING and TOOL_CALL carry hard deadlines (3 s for PONG, 5 s for TOOL_ACK). In chaos mode a control frame can arrive behind a gap; if its response were gated on the buffer draining in order, a single missing earlier seq plus a 2–6 s latency spike would blow the deadline and earn a `violation`. Answering on raw receipt decouples liveness (deadlines) from ordering (display), which is the standard split for heartbeat/keepalive traffic. Correctness against duplicates is preserved by the per-key dedup sets described in §7.
