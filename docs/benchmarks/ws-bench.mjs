import { io } from 'socket.io-client';
import http from 'node:http';

const MM_URL = 'http://localhost:3004';

function getToken() {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: 'localhost', port: 3000, path: '/api/account/auth/demo', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(JSON.parse(d).accessToken)); },
    );
    req.on('error', reject); req.end('{}');
  });
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(MM_URL, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 8000 });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

// RTT: emit quick_match:find -> first quick_match:progress (server responds synchronously before DB scan)
function rtt(socket, i) {
  return new Promise((resolve) => {
    const requestId = `rtt-${i}-${Math.random().toString(36).slice(2)}`;
    const t0 = process.hrtime.bigint();
    const onProgress = (ev) => {
      if (ev.requestId !== requestId) return;
      socket.off('quick_match:progress', onProgress);
      socket.emit('quick_match:stop', { requestId });
      resolve(Number(process.hrtime.bigint() - t0) / 1e6);
    };
    socket.on('quick_match:progress', onProgress);
    socket.emit('quick_match:find', { requestId });
  });
}

const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return +s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))].toFixed(1); };

async function main() {
  const token = await getToken();

  // --- Part A: RTT latency over a single warm connection ---
  const s = await connect(token);
  await rtt(s, -1); // warmup
  const lat = [];
  for (let i = 0; i < 200; i++) lat.push(await rtt(s, i));
  s.close();
  const rttResult = {
    samples: lat.length,
    avgMs: +(lat.reduce((a, b) => a + b, 0) / lat.length).toFixed(1),
    p50ms: pct(lat, 50), p95ms: pct(lat, 95), p99ms: pct(lat, 99), maxMs: +Math.max(...lat).toFixed(1),
  };

  // --- Part B: concurrent connection capacity ---
  const target = 500;
  const t0 = process.hrtime.bigint();
  const settled = await Promise.allSettled(Array.from({ length: target }, () => connect(token)));
  const connectMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const sockets = settled.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  // one RTT on each concurrently
  const t1 = process.hrtime.bigint();
  const rttAll = await Promise.all(sockets.map((sk, i) => rtt(sk, `c${i}`)));
  const broadcastMs = Number(process.hrtime.bigint() - t1) / 1e6;
  sockets.forEach((sk) => sk.close());
  const concResult = {
    attempted: target,
    connected: sockets.length,
    connectSuccessPercent: +(100 * sockets.length / target).toFixed(1),
    allConnectMs: +connectMs.toFixed(0),
    underLoadRttP50ms: pct(rttAll, 50),
    underLoadRttP95ms: pct(rttAll, 95),
    allRttWallMs: +broadcastMs.toFixed(0),
  };

  console.log(JSON.stringify({ rtt: rttResult, concurrency: concResult }, null, 2));
  process.exit(0);
}
main().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
