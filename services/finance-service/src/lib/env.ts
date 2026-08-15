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
  // Xác thực webhook SePay production bằng HMAC-SHA256 (khuyến cáo cho webhook
  // thanh toán). SePay ký `{timestamp}.{raw_body}` bằng Secret Key, gửi qua
  // header `X-SePay-Signature: sha256=<hex>` + `X-SePay-Timestamp`. Đặt qua env;
  // KHÔNG commit credential thật.
  sepayWebhookSecret: process.env.SEPAY_WEBHOOK_SECRET ?? 'dev-sepay-secret-change-me',
  // Tài khoản nhận tiền của nền tảng — dùng dựng VietQR (qr.sepay.vn). `bank` là
  // mã ngân hàng ngắn theo qr.sepay.vn (VD: TPBank, MBBank, OCB...). Với tài
  // khoản ảo (VA) SePay, nội dung chuyển khoản BẮT BUỘC chứa tiền tố VA
  // (SEPAY_VA_PREFIX, VD: TKPCTN) để SePay nhận diện đúng VA.
  sepayReceiverAccount: process.env.SEPAY_RECEIVER_ACCOUNT ?? '0000000000',
  sepayReceiverBank: process.env.SEPAY_RECEIVER_BANK ?? 'TPBank',
  sepayReceiverName: process.env.SEPAY_RECEIVER_NAME ?? 'COURTIN',
  sepayVaPrefix: process.env.SEPAY_VA_PREFIX ?? '',
  webOrigins: (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean),
};
