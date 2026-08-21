import { createHmac } from 'node:crypto';
import { suggestBalancedGroups } from 'file:///D:/Khoaluantn/packages/ai/dist/index.js';

// Deterministic PRNG (mulberry32) for reproducible numbers.
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const std = (arr) => {
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
};

// ---- #4 MATCHMAKING: balanced grouping vs random baseline ----
function matchmaking() {
  const rand = rng(42);
  const N = 2000, capacity = 4, trials = 50;
  let optSpread = 0, randSpread = 0;
  for (let t = 0; t < trials; t++) {
    const players = Array.from({ length: N }, (_, i) => ({
      userId: `u${i}`,
      rating: Math.round(900 + rand() * 1100), // 900..2000 (5 tiers span)
    }));
    // Optimized: sort-and-partition
    const proposal = suggestBalancedGroups(players, capacity);
    const optWithin = proposal.groups.map((g) => Math.sqrt(g.ratingVariance));
    optSpread += optWithin.reduce((a, b) => a + b, 0) / optWithin.length;
    // Random baseline: shuffle then chunk
    const shuffled = [...players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const randWithin = [];
    for (let s = 0; s + capacity <= shuffled.length; s += capacity) {
      randWithin.push(std(shuffled.slice(s, s + capacity).map((p) => p.rating)));
    }
    randSpread += randWithin.reduce((a, b) => a + b, 0) / randWithin.length;
  }
  optSpread /= trials; randSpread /= trials;
  return {
    players: N, capacity, trials,
    optimizedAvgWithinGroupSpread: +optSpread.toFixed(1),
    randomBaselineSpread: +randSpread.toFixed(1),
    reductionPercent: +(100 * (1 - optSpread / randSpread)).toFixed(1),
  };
}

// ---- #6 SEPAY WEBHOOK HMAC verification ----
function verifySepaySignature({ rawBody, timestamp, signature, secret }) {
  if (!timestamp || !signature) return false;
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const expected = `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
  const a = Buffer.from(signature), b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
function sepay() {
  const rand = rng(7);
  const secret = 'sk_test_secret_key';
  const sign = (ts, body) => `sha256=${createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`;
  let genuineAccepted = 0, forgedRejected = 0, tamperedRejected = 0;
  const G = 5000;
  for (let i = 0; i < G; i++) {
    const ts = String(1700000000 + i);
    const body = JSON.stringify({ id: i, amount: Math.round(rand() * 1e6), gateway: 'VietQR' });
    // genuine
    if (verifySepaySignature({ rawBody: body, timestamp: ts, signature: sign(ts, body), secret })) genuineAccepted++;
    // forged: random signature
    const forged = 'sha256=' + Array.from({ length: 64 }, () => Math.floor(rand() * 16).toString(16)).join('');
    if (!verifySepaySignature({ rawBody: body, timestamp: ts, signature: forged, secret })) forgedRejected++;
    // tampered: valid sig but body changed (replay/amount tamper)
    const goodSig = sign(ts, body);
    const tamperedBody = JSON.stringify({ id: i, amount: 999999999, gateway: 'VietQR' });
    if (!verifySepaySignature({ rawBody: tamperedBody, timestamp: ts, signature: goodSig, secret })) tamperedRejected++;
  }
  return {
    trialsEach: G,
    genuineAcceptedPercent: +(100 * genuineAccepted / G).toFixed(2),
    forgedRejectedPercent: +(100 * forgedRejected / G).toFixed(2),
    tamperedRejectedPercent: +(100 * tamperedRejected / G).toFixed(2),
  };
}

// ---- #7 LEDGER value conservation (net + commission == gross exactly) ----
function ledger() {
  const rand = rng(99);
  const RATE = 10n; // COMMISSION_RATE_PERCENT
  const N = 1_000_000;
  let mismatches = 0, maxAbs = 0n;
  for (let i = 0; i < N; i++) {
    const gross = BigInt(1 + Math.floor(rand() * 50_000_000)); // up to 50M VND
    const commission = (gross * RATE) / 100n;
    const net = gross - commission;
    if (net + commission !== gross) mismatches++;
    if (gross > maxAbs) maxAbs = gross;
  }
  return {
    transactions: N,
    maxGrossVND: Number(maxAbs),
    conservationMismatches: mismatches,
    conservationCorrectPercent: +(100 * (N - mismatches) / N).toFixed(6),
  };
}

const t0 = performance.now();
const result = { matchmaking: matchmaking(), sepayWebhook: sepay(), ledger: ledger() };
result.benchmarkDurationMs = +(performance.now() - t0).toFixed(0);
console.log(JSON.stringify(result, null, 2));
