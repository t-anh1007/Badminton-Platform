function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  port: Number(process.env.FINANCE_PORT ?? 3003),
  databaseUrl: required('FINANCE_DATABASE_URL'),
  rabbitmqUrl: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
  jwtSecret: process.env.JWT_SECRET ?? 'change-me-in-real-env',
  // G4 (FIN-06): finance-service hỏi venue-booking-service booking còn hold
  // không (flows.md §5) qua API nội bộ, không phải event.
  venueBookingServiceUrl: process.env.VENUE_BOOKING_SERVICE_URL ?? 'http://localhost:3002',
  // D23: xác thực webhook SePay bằng shared secret (GĐ1). PO đặt qua env; KHÔNG
  // nhập credential SePay production vào code. Xác thực chữ ký/HMAC thật để lại
  // khi tích hợp SePay production.
  sepayWebhookSecret: process.env.SEPAY_WEBHOOK_SECRET ?? 'dev-sepay-secret-change-me',
  webOrigins: (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean),
};
