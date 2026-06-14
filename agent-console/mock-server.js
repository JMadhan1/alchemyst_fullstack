/**
 * mock-server.js — Local WebSocket test server for Agent Console
 *
 * Simulates the full Alchemyst protocol: TOKEN, TOOL_CALL, TOOL_RESULT,
 * CONTEXT_SNAPSHOT, PING, STREAM_END, and optionally chaos mode.
 *
 * Usage:
 *   node mock-server.js           # normal mode
 *   node mock-server.js --chaos   # chaos mode (OOO, duplicates, drops)
 *   node mock-server.js --fast    # rapid token streaming
 *
 * Requires: npm install ws   (or use the ws already in node_modules)
 */

const { WebSocketServer, WebSocket } = require('ws');

const PORT = 4747;
const CHAOS = process.argv.includes('--chaos');
const FAST  = process.argv.includes('--fast');

const wss = new WebSocketServer({ port: PORT });
console.log(`\n⬡ Agent Console mock server — ws://localhost:${PORT}/ws`);
console.log(`  Mode: ${CHAOS ? '⚡ CHAOS' : FAST ? '🚀 FAST' : '✓ Normal'}\n`);

let globalSeq = 1;
function nextSeq() { return globalSeq++; }

function send(ws, msg) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(msg));
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/* ── PING loop ──────────────────────────────────────────────────────────── */
function startPingLoop(ws) {
  let pingCount = 0;
  const iv = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) { clearInterval(iv); return; }
    pingCount++;
    const challenge = `ping-${pingCount}-${Math.random().toString(36).slice(2, 8)}`;
    const seq = nextSeq();
    send(ws, { type: 'PING', seq, challenge });
    console.log(`  → PING seq=${seq} challenge=${challenge}`);

    // Corrupt PING in chaos mode (occasionally omit challenge)
    if (CHAOS && pingCount % 4 === 0) {
      const badSeq = nextSeq();
      send(ws, { type: 'PING', seq: badSeq /* no challenge */ });
      console.log(`  → CORRUPT PING seq=${badSeq} (no challenge) [chaos]`);
    }
  }, 8000);
  return () => clearInterval(iv);
}

/* ── Context snapshot ───────────────────────────────────────────────────── */
function sendContextSnapshot(ws, contextId, data, streamId) {
  const seq = nextSeq();
  send(ws, {
    type: 'CONTEXT_SNAPSHOT',
    seq,
    context_id: contextId,
    stream_id: streamId,
    data,
  });
  console.log(`  → CONTEXT_SNAPSHOT seq=${seq}`);
}

/* ── Token stream ───────────────────────────────────────────────────────── */
async function streamTokens(ws, streamId, words, delayMs = 60) {
  let seq = nextSeq(); // allocate first seq
  const seqs = [seq];

  // Pre-allocate all seqs so we can send OOO in chaos
  const extras = [];
  for (let i = 1; i < words.length; i++) {
    const s = nextSeq();
    seqs.push(s);
  }

  if (CHAOS) {
    // Shuffle some tokens for out-of-order delivery
    const shuffled = [...seqs];
    for (let i = shuffled.length - 1; i > 0; i--) {
      if (Math.random() < 0.25) {
        const j = Math.max(0, i - 2);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
    }

    // Send in shuffled order
    for (let i = 0; i < words.length; i++) {
      if (ws.readyState !== WebSocket.OPEN) return;
      const s = shuffled[i];
      send(ws, { type: 'TOKEN', seq: s, stream_id: streamId, text: words[i] });
      if (i === 0) console.log(`  → TOKEN stream_id=${streamId} (${words.length} tokens, chaos OOO)`);

      // Occasionally send a duplicate
      if (Math.random() < 0.15) {
        await sleep(10);
        send(ws, { type: 'TOKEN', seq: s, stream_id: streamId, text: words[i] });
        console.log(`  → DUPLICATE TOKEN seq=${s} [chaos]`);
      }
      await sleep(delayMs);
    }
  } else {
    for (let i = 0; i < words.length; i++) {
      if (ws.readyState !== WebSocket.OPEN) return;
      send(ws, { type: 'TOKEN', seq: seqs[i], stream_id: streamId, text: words[i] });
      if (i === 0) console.log(`  → TOKEN stream_id=${streamId} (${words.length} tokens)`);
      await sleep(FAST ? 15 : delayMs);
    }
  }
}

/* ── Full response scenario ─────────────────────────────────────────────── */
const STREAM_ID = () => `stream-${Date.now().toString(36)}`;
const CALL_ID   = () => `call-${Math.random().toString(36).slice(2, 10)}`;
const CTX_ID    = `ctx-main-${Math.random().toString(36).slice(2, 6)}`;

const SCENARIO_WORDS = (prefix) => (
  `${prefix} I am processing your request using the agent reasoning engine. `.split(' ')
    .concat('Let me search for relevant information across available data sources. '.split(' '))
    .concat('This involves multiple sequential reasoning steps with tool calls. '.split(' '))
    .filter(Boolean)
    .map(w => w + ' ')
);

async function runScenario(ws, userMessage) {
  const streamId = STREAM_ID();
  console.log(`\n[scenario] user: "${userMessage.slice(0, 60)}"`);

  // 1. Initial context snapshot
  sendContextSnapshot(ws, CTX_ID, {
    user_query: userMessage,
    agent_state: 'reasoning',
    step: 1,
    memory: { session_id: streamId, turn_count: 1 },
  }, streamId);

  await sleep(200);

  // 2. Stream opening tokens
  const intro = SCENARIO_WORDS('Sure!');
  await streamTokens(ws, streamId, intro, FAST ? 20 : 60);

  await sleep(150);

  // 3. First tool call
  const callId1 = CALL_ID();
  const toolCallSeq = nextSeq();
  send(ws, {
    type: 'TOOL_CALL',
    seq: toolCallSeq,
    stream_id: streamId,
    call_id: callId1,
    tool_name: 'search_knowledge_base',
    args: { query: userMessage, max_results: 5, include_metadata: true },
  });
  console.log(`  → TOOL_CALL call_id=${callId1} tool=search_knowledge_base`);

  // Wait for TOOL_ACK (client sends it within 2s)
  await sleep(2500);

  // 4. Tool result
  const toolResultSeq = nextSeq();
  send(ws, {
    type: 'TOOL_RESULT',
    seq: toolResultSeq,
    stream_id: streamId,
    call_id: callId1,
    result: {
      results: [
        { id: 'doc-001', title: 'Agent Architecture Overview', score: 0.97 },
        { id: 'doc-002', title: 'Protocol Compliance Requirements', score: 0.91 },
        { id: 'doc-003', title: 'WebSocket Streaming Reference', score: 0.88 },
      ],
      total: 3,
      latency_ms: 142,
    },
  });
  console.log(`  → TOOL_RESULT call_id=${callId1}`);

  await sleep(300);

  // 5. More streaming tokens after tool result
  const analysis = 'Based on the search results, I can provide a comprehensive answer. The agent architecture uses a streaming WebSocket protocol with sequence numbers to ensure ordered delivery. The protocol supports tool calls mid-stream, which interrupt token generation and resume after the result arrives. '.split(' ').filter(Boolean).map(w => w + ' ');
  await streamTokens(ws, streamId, analysis, FAST ? 25 : 55);

  // 6. Second tool call (to show stacking)
  await sleep(200);
  const callId2 = CALL_ID();
  send(ws, {
    type: 'TOOL_CALL',
    seq: nextSeq(),
    stream_id: streamId,
    call_id: callId2,
    tool_name: 'compute_summary',
    args: { doc_ids: ['doc-001', 'doc-002'], format: 'markdown', max_length: 500 },
  });
  console.log(`  → TOOL_CALL call_id=${callId2} tool=compute_summary`);

  await sleep(1800);

  send(ws, {
    type: 'TOOL_RESULT',
    seq: nextSeq(),
    stream_id: streamId,
    call_id: callId2,
    result: {
      summary: 'The agent protocol requires: (1) PONG within 3s of PING, (2) TOOL_ACK within 2s of TOOL_CALL, (3) monotonically increasing seq numbers, (4) RESUME on reconnect with last_seq.',
      word_count: 42,
    },
  });
  console.log(`  → TOOL_RESULT call_id=${callId2}`);

  await sleep(250);

  // 7. Updated context snapshot (shows diff)
  sendContextSnapshot(ws, CTX_ID, {
    user_query: userMessage,
    agent_state: 'concluding',
    step: 3,
    memory: { session_id: streamId, turn_count: 1 },
    tool_results: { search: 3, summarized: 2 },
  }, streamId);

  await sleep(200);

  // 8. Closing tokens
  const conclusion = 'In conclusion, the system correctly handles streaming tokens, mid-stream tool calls, context snapshots, and protocol compliance monitoring in real time. '.split(' ').filter(Boolean).map(w => w + ' ');
  await streamTokens(ws, streamId, conclusion, FAST ? 20 : 50);

  // 9. STREAM_END
  await sleep(100);
  const endSeq = nextSeq();
  send(ws, { type: 'STREAM_END', seq: endSeq, stream_id: streamId });
  console.log(`  → STREAM_END seq=${endSeq} stream_id=${streamId}`);

  console.log(`[scenario] complete. Total messages sent: seq 1–${endSeq}\n`);
}

/* ── Connection handler ─────────────────────────────────────────────────── */
wss.on('connection', (ws, req) => {
  console.log(`[connect] client connected (${new Date().toLocaleTimeString()})`);

  // Reset seq for each session
  globalSeq = 1;

  let stopPing = startPingLoop(ws);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      console.log('  ← malformed message:', raw.toString().slice(0, 80));
      return;
    }

    console.log(`  ← ${msg.type}`, msg.type === 'PONG' ? `challenge=${msg.challenge}` : msg.type === 'USER_MESSAGE' ? `"${msg.content?.slice(0, 50)}"` : '');

    switch (msg.type) {
      case 'PONG':
        // Valid PONG — compliance tracked on client side
        break;

      case 'TOOL_ACK':
        console.log(`  ← TOOL_ACK call_id=${msg.call_id} ✓`);
        break;

      case 'RESUME':
        console.log(`  ← RESUME last_seq=${msg.last_seq} — replaying from seq ${msg.last_seq + 1}`);
        // In real server: replay messages from last_seq+1
        // Here we just acknowledge
        send(ws, { type: 'RESUMED', seq: nextSeq() });
        break;

      case 'USER_MESSAGE':
        // Run the full scenario
        runScenario(ws, msg.content || 'Hello agent').catch(console.error);
        break;

      default:
        console.log(`  ← unknown: ${msg.type}`);
    }
  });

  ws.on('close', (code, reason) => {
    stopPing();
    console.log(`[disconnect] client disconnected code=${code} reason=${reason.toString() || '(none)'}`);
  });

  ws.on('error', (err) => {
    console.log('[error]', err.message);
  });
});

wss.on('error', (err) => {
  console.error('Server error:', err.message);
  if (err.message.includes('EADDRINUSE')) {
    console.error(`Port ${PORT} is already in use. Kill the other process first.`);
  }
  process.exit(1);
});
