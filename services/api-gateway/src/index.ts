import express from 'express';

const SERVICE_NAME = 'api-gateway';
const PORT = Number(process.env.GATEWAY_PORT ?? 3000);

const app = express();
app.use(express.json());

// Health/readiness — proof #4 của Gboot yêu cầu trả 200.
app.get('/health', (_req, res) => {
  res.status(200).json({ service: SERVICE_NAME, status: 'ok', ts: new Date().toISOString() });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[${SERVICE_NAME}] listening on :${PORT}`);
});
