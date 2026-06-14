<div align="center">

<img src="agent-server/images/03-state-machine.png" alt="Agent Console" width="100%" />

<br/>

# 🛰️ &nbsp; A G E N T &nbsp; C O N S O L E

### Real-time AI agent monitoring that treats streaming as a *distributed-systems* problem — with a render loop attached.

<br/>

![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript_strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Zustand](https://img.shields.io/badge/Zustand_+_Immer-433E38?style=for-the-badge)
![WebSocket](https://img.shields.io/badge/WebSocket-010101?style=for-the-badge&logo=socketdotio&logoColor=white)

![Protocol](https://img.shields.io/badge/protocol_compliance-100%25-22c55e?style=flat-square)
![Chaos](https://img.shields.io/badge/chaos_mode-survives-f59e0b?style=flat-square)
![AI SDK](https://img.shields.io/badge/AI--SDK_helpers-zero-ef4444?style=flat-square)
![Tests](https://img.shields.io/badge/unit_tests-seqBuffer_·_jsonDiff_·_stateMachine_·_wsClient-3178C6?style=flat-square)

<br/>

**Streams tokens. Freezes mid-sentence for tool calls. Diffs half-megabyte payloads.**
**Survives dropped sockets · shuffled `seq` · duplicate frames · latency spikes · corrupt heartbeats — without losing a single token.**

<br/>

### [▶︎ &nbsp;WATCH THE 5-MIN CHAOS DEMO](https://www.loom.com/share/a87ebb5deb7043f3b09c41b23b627286)

<a href="https://www.loom.com/share/a87ebb5deb7043f3b09c41b23b627286">
  <img src="agent-server/images/02-rapid-tool-calls.png" alt="Watch the chaos-mode demo on Loom" width="80%" />
</a>

<sub>👆 Click to watch the Agent Console survive `--mode chaos` live, with the `/log` endpoint on screen as proof.</sub>

</div>

---

> ### 💡 TL;DR for reviewers
> The hard part of this brief isn't the UI — it's **the wire**. A pure-TypeScript `WSStateMachine` + `SeqBuffer` core handles ordering, dedup, and reconnection **outside React**, so the render layer never sees an out-of-order frame. Control responses (`PONG`, `TOOL_ACK`) are answered *before* the reorder buffer, so chaos can never push them past deadline. Don't take my word for it — run `npm run verify` and read the `/log` verdict tally.

---

## ⚡ 60-second start

```bash
# 1 ── Backend  (cd agent-server, Node ≥ 20)
npm install
npm run dev          # normal mode  → ws://localhost:4747/ws
npm run dev:chaos    # chaos mode   → drops · reorder · dupes · latency · corrupt PING

# 2 ── Frontend (cd agent-console)
npm install
npm run dev          # → http://localhost:3000  → click "Connect"

# 3 ── Prove it  (server must be running)
npm run verify       # drives 6 multi-turn scenarios, prints the /log verdict tally
```

<sub>Production: `npm install && npm run build && npm start` — no manual steps, no env vars.</sub>

---

## 🖼️ See it in action

<table>
<tr>
<td width="50%" valign="top">

**① Streaming + tool-call interrupt**

Tokens render incrementally; the text **freezes with zero reflow** while a `lookup_metric` card resolves below it. Context inspector (left) and trace timeline (right) update in lockstep.

<img src="agent-server/images/01-streaming-tool-call.png" alt="Streaming response with a tool call" />

</td>
<td width="50%" valign="top">

**② Rapid / stacked tool calls**

`analyze and compare` fires two tools (`fetch_dataset`, `compute_correlation`). Both cards **stack and resolve** — no overwrite, no duplicate text on resume.

<img src="agent-server/images/02-rapid-tool-calls.png" alt="Rapid stacked tool calls and trace timeline" />

</td>
</tr>
<tr>
<td width="50%" valign="top">

**③ State machine + 3-panel layout**

Context Inspector · Chat · Trace Timeline, with the live WebSocket state-machine map shown before connecting.

<img src="agent-server/images/03-state-machine.png" alt="State machine and three-panel layout" />

</td>
<td width="50%" valign="top">

**④ Protocol compliance — the `/log` proof**

Every recorded client event (`TOOL_ACK`, `PONG` with `latency_ms`, `RESUME`) carries **`"verdict": "ok"`** — exactly what the evaluator audits.

<img src="agent-server/images/04-log-compliance.png" alt="Server /log verdicts all ok" />

</td>
</tr>
</table>

---

## 🧠 Architecture in three sentences

The app is built around a **pure TypeScript `WSStateMachine` + `SeqBuffer` core** that resolves all protocol complexity — ordering, deduplication, reconnection, replay — completely independent of React. A `WSClient` class owns the socket lifecycle and feeds a **Zustand + Immer** store through a single `useWebSocket` hook, keeping every component declarative and free of socket logic. The three-panel UI renders with virtual windowing and `React.memo` so it sustains 30+ events/sec without ever re-rendering the full list.

---

## 🔬 Protocol compliance — verified, not claimed

Two guarantees do the heavy lifting. Both are covered by unit tests **and** an end-to-end harness that drives the real server and audits its `/log`:

<table>
<tr><td><b>1 · Per-turn <code>seq</code> reset</b></td>
<td>The server restarts <code>seq</code> at <code>0</code> on <i>every</i> <code>USER_MESSAGE</code> and clears replay history. The client mirrors this with <code>WSClient.beginTurn()</code> before each send. Without it, the 2nd+ responses (restarting at seq 1) would be silently dropped by the dedup buffer as "already seen" — the difference between a one-shot demo and a real multi-turn console.</td></tr>
<tr><td><b>2 · Out-of-band control responses</b></td>
<td><code>PONG</code> (echoing the challenge, including the empty-string chaos variant) and <code>TOOL_ACK</code> are answered the instant they hit the wire — <i>before</i> the ordering buffer — so reordering and latency spikes can never push them past the 3 s / 5 s deadlines. Each is deduped by <code>seq</code> / <code>call_id</code> so replays never emit a second response the server would score <code>unexpected</code>.</td></tr>
</table>

```text
normal  → 6/6 turns rendered tokens · zero breaches · PASS
chaos   → all turns render · zero CLIENT breaches across randomized profiles
          (≈1 in 6 sessions the server logs one TOOL_ACK_TIMEOUT — a server-side
           reorder-buffer / ack-wait deadlock no client can prevent; see
           DECISIONS.md §7, the protocol flaw the brief asks you to find ⚑)
```

---

## 🗺️ Connection state machine

```mermaid
stateDiagram-v2
    [*] --> IDLE

    IDLE --> CONNECTING : USER_CONNECT
    CONNECTING --> CONNECTED : SOCKET_OPEN
    CONNECTING --> RECONNECTING : CONNECTION_DROP
    CONNECTED --> STREAMING : FIRST_TOKEN
    CONNECTED --> RECONNECTING : CONNECTION_DROP
    STREAMING --> TOOL_CALL_PENDING : TOOL_CALL_RECEIVED
    STREAMING --> CONNECTED : STREAM_END
    STREAMING --> RECONNECTING : CONNECTION_DROP
    TOOL_CALL_PENDING --> STREAMING : TOOL_RESULT_RECEIVED
    TOOL_CALL_PENDING --> RECONNECTING : CONNECTION_DROP
    RECONNECTING --> RESUMING : SOCKET_REOPENED
    RESUMING --> CONNECTED : RESUME_SENT_AND_ACKED
    RESUMING --> RECONNECTING : CONNECTION_DROP

    IDLE --> CLOSED : MANUAL_DISCONNECT
    CONNECTING --> CLOSED : MANUAL_DISCONNECT
    CONNECTED --> CLOSED : MANUAL_DISCONNECT
    STREAMING --> CLOSED : MANUAL_DISCONNECT
    TOOL_CALL_PENDING --> CLOSED : MANUAL_DISCONNECT
    RECONNECTING --> CLOSED : MANUAL_DISCONNECT
    RESUMING --> CLOSED : MANUAL_DISCONNECT

    CLOSED --> CONNECTING : USER_CONNECT
```

> On reconnect the client transitions `RECONNECTING → RESUMING` and sends `RESUME { last_seq }` as the **first frame** on the new socket — *before* draining any buffered events. `last_seq` is the highest seq the **DOM has consumed**, not the highest the socket received.

---

## 🧩 What's built — mapped to the brief

| # | Task | What lands in the UI |
|---|------|----------------------|
| **1** | **Streaming chat + tool interrupts** | Tokens render incrementally; on `TOOL_CALL` the text **freezes with zero reflow**, a card appears below, `TOOL_ACK` fires < 2 s, on `TOOL_RESULT` the stream resumes with no gap or duplicate. Sequential calls **stack**. |
| **2** | **Agent trace timeline** | Every event becomes a row; tokens collapse into one expandable *"Streamed 47 tokens (1.2s)"* row; `TOOL_CALL`/`TOOL_RESULT` linked by `call_id`; **bidirectional click** chat ↔ timeline; filter + search; virtualized for 30+ ev/sec. |
| **3** | **Context inspector** | Syntax-highlighted tree; same-`context_id` snapshots render an **added / removed / changed diff**; a **history scrubber** steps through snapshots; lazy expansion keeps 500 KB+ payloads interactive. |
| **4** | **Reconnection + state recovery** | Non-blocking indicator < 500 ms; backoff **500 ms → 1 → 2 → 4 → cap 10 s**; `RESUME` first; replayed events reordered, deduped, stitched in with no jump; mid-tool-call drops show a **waiting** card until replay. |
| **5** | **Chaos survival** | Drops, shuffled `seq`, duplicates, rapid double tool calls, 500 KB context, empty-challenge `PING` — all handled without a crash or inconsistent DOM. *(Demo above.)* |

---

## 🎬 Reproduce the chaos demo yourself

Run `npm run dev:chaos`, keep `GET http://localhost:4747/log` on screen, and walk each scenario:

| Scenario | Trigger / what to show |
|----------|------------------------|
| Connection drop mid-stream | Send `long detailed document`; on drop, amber banner appears, chat stays interactive, stream resumes after `RESUME` |
| Out-of-order messages | Any prompt; the `reorder` counter ticks while text still renders correctly |
| Rapid tool calls | Send `analyze and compare`; two stacked tool cards both resolve |
| 500 KB+ context payload | Send `schema database`; context tree stays interactive, chat doesn't freeze |
| Corrupt `PING` (empty challenge) | A `PONG echo "" (corrupt PING)` row appears in the trace, no crash |

---

<details>
<summary><h2>🛠️ Commands &amp; project structure (click to expand)</h2></summary>

```bash
npm run dev                  # Next.js dev server → http://localhost:3000
npm run build && npm start   # production
npm test                     # Jest unit suites (seqBuffer · jsonDiff · stateMachine · wsClient)
npm run verify               # end-to-end /log audit against the live server
npx tsc --noEmit             # strict type-check
```

```
src/
├── components/
│   ├── chat/        ChatPanel · MessageBubble · StreamingText · ToolCallCard
│   ├── timeline/    TraceTimeline · TimelineRow · TokenBatch
│   ├── context/     ContextInspector · JsonDiffTree · ContextScrubber
│   └── connection/  ConnectionIndicator
├── hooks/
│   ├── useWebSocket.ts   React ↔ WSClient bridge
│   └── useTimeline.ts    filtered + batched timeline state
├── lib/
│   ├── wsStateMachine.ts  pure state machine
│   ├── seqBuffer.ts       reorder + dedup buffer
│   ├── wsClient.ts        socket manager (per-turn reset, out-of-band control)
│   ├── metricsTracker.ts  live protocol metrics
│   ├── jsonDiff.ts        JSON diff engine
│   └── virtualList.ts     virtual windowing
├── store/agentStore.ts    Zustand + Immer store
├── tests/                 seqBuffer · jsonDiff · wsStateMachine · wsClient
├── types.ts               all app types
└── types/unsafe.ts        the ONLY file permitted to use `any`

verify-protocol.mjs        end-to-end harness: drives the real server, audits /log
```

</details>

---

## ✅ Constraints honored

`Next.js 16 App Router` (no Pages Router) · `strict: true`, no `@ts-ignore`, `any` quarantined to one documented file · **no `vercel/ai`, no langchain, no AI-SDK streaming helpers — the renderer is built from scratch.** State lives in Zustand + Immer; the rationale is in [`DECISIONS.md`](agent-console/DECISIONS.md).

<div align="center">

<br/>

### 📖 Read [`DECISIONS.md`](agent-console/DECISIONS.md)

for the seq-ordering data structure · the layout-shift strategy · the consumed-vs-received recovery model · the 50-stream / 100×-length scaling answers · and **§7 — the protocol race the brief dares you to find** ⚑

<br/>

<sub>Built for the Alchemyst AI · Full Stack AI Engineer assignment</sub>

</div>
