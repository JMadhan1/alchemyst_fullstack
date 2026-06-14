/**
 * verify-protocol.mjs — End-to-end protocol verification against the REAL server.
 *
 * Drives ws://localhost:4747/ws exactly as the browser client does:
 *   • per-turn seq reset (server restarts seq at 0 each USER_MESSAGE)
 *   • out-of-band, deduplicated PONG (echo challenge) and TOOL_ACK
 *   • RESUME(last_seq) as the first frame after a drop
 *
 * Then it reads GET /log and asserts the server recorded no protocol breaches.
 *
 * Usage:  node verify-protocol.mjs            (assumes server on :4747)
 *         node verify-protocol.mjs <httpBase> <wsUrl>
 */

const HTTP_BASE = process.argv[2] || 'http://localhost:4747';
const WS_URL = process.argv[3] || 'ws://localhost:4747/ws';

const BAD_VERDICTS = new Set(['violation', 'error', 'unexpected', 'wrong_challenge']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class ProtoClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.socket = null;
    this.manualClose = false;
    this.backoff = 300;
    this.resetTurn();
    this.turnResolve = null;
    this.silenceTimer = null;
  }

  resetTurn() {
    // Mirror of WSClient.beginTurn(): the server restarts numbering per turn.
    this.nextExpected = 1;
    this.buffer = new Map();
    this.processed = new Set();
    this.respondedPings = new Set();
    this.ackedCalls = new Set();
    this.lastRendered = 0;
    this.lastReceived = 0;
    this.turnTokens = 0;
    this.turnTools = 0;
    this.streamEnded = false;
  }

  connect() {
    return new Promise((resolve) => {
      this._open(resolve);
    });
  }

  _open(onReady) {
    const ws = new WebSocket(this.wsUrl);
    this.socket = ws;
    ws.onopen = () => {
      this.backoff = 300;
      // On a reconnect, RESUME must be the first frame so the server replays.
      if (this.lastRendered > 0) {
        this._send({ type: 'RESUME', last_seq: this.lastRendered });
      }
      onReady?.();
    };
    ws.onmessage = (e) => this._onMessage(e);
    ws.onclose = () => {
      if (this.manualClose) return;
      // Auto-reconnect (chaos hard-drop) — preserve seq state, do NOT resetTurn.
      setTimeout(() => this._open(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, 5000);
    };
    ws.onerror = () => {};
  }

  _send(obj) {
    if (this.socket && this.socket.readyState === 1) {
      this.socket.send(JSON.stringify(obj));
    }
  }

  _onMessage(e) {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (typeof msg?.type !== 'string' || typeof msg?.seq !== 'number') return;

    this._noteActivity();

    // ── Out-of-band, deduplicated control responses ──
    if (msg.type === 'PING') {
      if (!this.respondedPings.has(msg.seq)) {
        this.respondedPings.add(msg.seq);
        this._send({ type: 'PONG', echo: typeof msg.challenge === 'string' ? msg.challenge : '' });
      }
    } else if (msg.type === 'TOOL_CALL') {
      if (!this.ackedCalls.has(msg.call_id)) {
        this.ackedCalls.add(msg.call_id);
        this._send({ type: 'TOOL_ACK', call_id: msg.call_id });
      }
    }

    this.lastReceived = Math.max(this.lastReceived, msg.seq);

    // ── Ordered drain (reorder + dedup) ──
    if (msg.seq >= this.nextExpected && !this.buffer.has(msg.seq)) {
      this.buffer.set(msg.seq, msg);
    }
    while (this.buffer.has(this.nextExpected)) {
      const m = this.buffer.get(this.nextExpected);
      this.buffer.delete(this.nextExpected);
      this.nextExpected++;
      if (this.processed.has(m.seq)) continue;
      this.processed.add(m.seq);
      this._dispatch(m);
    }
  }

  _dispatch(m) {
    this.lastRendered = Math.max(this.lastRendered, m.seq);
    if (m.type === 'TOKEN') this.turnTokens++;
    else if (m.type === 'TOOL_CALL') this.turnTools++;
    else if (m.type === 'STREAM_END') {
      this.streamEnded = true;
      this._finishTurn();
    }
  }

  _noteActivity() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    // If the stream never formally ends (e.g. chaos drop), resolve on silence.
    this.silenceTimer = setTimeout(() => this._finishTurn(), 3000);
  }

  _finishTurn() {
    if (this.turnResolve) {
      const r = this.turnResolve;
      this.turnResolve = null;
      if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
      r();
    }
  }

  async sendUser(content) {
    this.resetTurn();
    this._send({ type: 'USER_MESSAGE', content });
    await new Promise((resolve) => {
      this.turnResolve = resolve;
      // Hard cap per turn.
      setTimeout(() => this._finishTurn(), 20000);
    });
    return { tokens: this.turnTokens, tools: this.turnTools, streamEnded: this.streamEnded };
  }

  close() {
    this.manualClose = true;
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    try { this.socket?.close(); } catch {}
  }
}

async function getJson(path) {
  const res = await fetch(HTTP_BASE + path);
  return res.json();
}

async function run() {
  console.log(`\n── Verifying against ${WS_URL} ──`);
  await getJson('/reset');
  const health = await getJson('/health');
  console.log(`server mode: ${health.mode}`);

  const client = new ProtoClient(WS_URL);
  await client.connect();
  await sleep(200);

  const prompts = [
    ['hello', 'basic streaming, no tools'],
    ['report q3', 'mid-stream tool + context'],
    ['analyze and compare', 'two sequential tool calls'],
    ['lookup the user', 'pre-stream tool call'],
    ['schema for the database', 'large 500KB+ payload'],
    ['long detailed document', 'extended response'],
  ];

  const results = [];
  for (const [prompt, desc] of prompts) {
    const r = await client.sendUser(prompt);
    results.push({ prompt, desc, ...r });
    console.log(
      `  turn "${prompt}" → tokens=${r.tokens} tools=${r.tools} ` +
      `streamEnd=${r.streamEnded ? 'yes' : 'no(resumed/quiet)'}  [${desc}]`
    );
    await sleep(150);
  }

  client.close();
  await sleep(300);

  const log = await getJson('/log');
  const bad = log.filter((e) => BAD_VERDICTS.has(e.verdict));
  const byVerdict = log.reduce((acc, e) => {
    acc[e.verdict ?? 'none'] = (acc[e.verdict ?? 'none'] || 0) + 1;
    return acc;
  }, {});

  console.log('\n  /log verdict tally:', JSON.stringify(byVerdict));

  const turnsWithTokens = results.filter((r) => r.tokens > 0).length;
  console.log(`  turns that rendered tokens: ${turnsWithTokens}/${results.length}`);

  if (bad.length > 0) {
    console.log(`\n  ❌ ${bad.length} protocol breach(es):`);
    for (const b of bad.slice(0, 10)) {
      console.log(`     [${b.verdict}] ${b.type} ${JSON.stringify(b.data).slice(0, 120)}`);
    }
  } else {
    console.log('\n  ✅ Zero protocol breaches recorded by the server.');
  }

  return { mode: health.mode, bad: bad.length, turnsWithTokens, total: results.length };
}

run()
  .then((r) => {
    const ok = r.bad === 0 && (r.mode === 'chaos' || r.turnsWithTokens === r.total);
    console.log(`\n── ${ok ? 'PASS' : 'FAIL'} (${r.mode}) ──\n`);
    process.exit(ok ? 0 : 1);
  })
  .catch((err) => {
    console.error('harness error:', err);
    process.exit(2);
  });
