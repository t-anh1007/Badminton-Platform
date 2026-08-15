function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  port: Number(process.env.VENUE_BOOKING_PORT ?? 3002),
  databaseUrl: required('VENUE_BOOKING_DATABASE_URL'),
  rabbitmqUrl: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
  jwtSecret: process.env.JWT_SECRET ?? 'change-me-in-real-env',
  webOrigins: (process.env.WEB_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};
