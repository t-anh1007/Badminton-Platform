import express, { type Request, type Response, type NextFunction } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

const SERVICE_NAME = 'api-gateway';
const PORT = Number(process.env.GATEWAY_PORT ?? 3000);

const webOrigins = (process.env.WEB_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const services: Record<string, string> = {
  '/api/account':    process.env.ACCOUNT_SERVICE_URL    ?? 'http://localhost:3001',
  '/api/venue':      process.env.VENUE_BOOKING_SERVICE_URL ?? 'http://localhost:3002',
  '/api/finance':    process.env.FINANCE_SERVICE_URL    ?? 'http://localhost:3003',
  '/api/matchmaking': process.env.MATCHMAKING_SERVICE_URL ?? 'http://localhost:3004',
  '/api/community':  process.env.COMMUNITY_SERVICE_URL  ?? 'http://localhost:3005',
};

const app = express();

// CORS — evaluated per request so WEB_ORIGIN hot-reload-friendly in dev.
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin && webOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type,Authorization,X-Internal-Service-Token',
    );
  }
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ service: SERVICE_NAME, status: 'ok', ts: new Date().toISOString() });
});

// Route each /api/<prefix> to its backing service, stripping the prefix.
for (const [prefix, target] of Object.entries(services)) {
  app.use(
    prefix,
    createProxyMiddleware({
      target,
      changeOrigin: true,
      pathRewrite: { [`^${prefix}`]: '' },
      on: {
        error: (_err, _req, res) => {
          (res as Response).status(502).json({ error: { message: 'Service unavailable' } });
        },
      },
    }),
  );
}

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[${SERVICE_NAME}] listening on :${PORT}`);
});
