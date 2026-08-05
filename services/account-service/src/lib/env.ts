function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  port: Number(process.env.ACCOUNT_PORT ?? 3001),
  databaseUrl: required('ACCOUNT_DATABASE_URL'),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  rabbitmqUrl: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
  jwtSecret: process.env.JWT_SECRET ?? 'change-me-in-real-env',
  accessTokenTtlSec: 15 * 60, // 15 phút
  refreshTokenTtlSec: 30 * 24 * 60 * 60, // 30 ngày
};
