import http from 'node:http';

const agent = new http.Agent({ keepAlive: true, maxSockets: 64 });

function once(path) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const req = http.get({ host: 'localhost', port: 3000, path, agent }, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve({ ms: Number(process.hrtime.bigint() - t0) / 1e6, code: res.statusCode }));
    });
    req.on('error', () => resolve({ ms: Number(process.hrtime.bigint() - t0) / 1e6, code: 0 }));
  });
}

async function bench(name, path, total, concurrency) {
  // warmup
  await Promise.all(Array.from({ length: concurrency }, () => once(path)));
  const lat = [];
  let ok = 0, done = 0;
  const t0 = process.hrtime.bigint();
  await new Promise((resolve) => {
    let launched = 0;
    const launch = async () => {
      if (launched >= total) { if (done >= total) resolve(); return; }
      launched++;
      const r = await once(path);
      lat.push(r.ms); if (r.code >= 200 && r.code < 400) ok++;
      done++;
      if (done >= total) resolve(); else launch();
    };
    for (let i = 0; i < concurrency; i++) launch();
  });
  const wallMs = Number(process.hrtime.bigint() - t0) / 1e6;
  lat.sort((a, b) => a - b);
  const pct = (p) => +lat[Math.min(lat.length - 1, Math.floor(p / 100 * lat.length))].toFixed(1);
  return {
    name, path, total, concurrency,
    okPercent: +(100 * ok / total).toFixed(1),
    reqPerSec: +(total / (wallMs / 1000)).toFixed(0),
    p50ms: pct(50), p95ms: pct(95), p99ms: pct(99),
    maxMs: +lat[lat.length - 1].toFixed(1),
  };
}

const out = [];
out.push(await bench('gateway /health (raw)', '/health', 3000, 50));
out.push(await bench('proxy hop /api/matchmaking/health', '/api/matchmaking/health', 3000, 50));
out.push(await bench('DB-backed /api/matchmaking/matches', '/api/matchmaking/matches', 1000, 30));
console.log(JSON.stringify(out, null, 2));
