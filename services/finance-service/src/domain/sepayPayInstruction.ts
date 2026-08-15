import { env } from '../lib/env.js';

/** Thông tin để người dùng chuyển khoản đúng: tài khoản nhận của nền tảng +
 * ảnh VietQR do SePay dựng (đã nhúng số tiền và mã đối soát vào nội dung). */
export interface SepayPayInstruction {
  bankCode: string;
  accountNumber: string;
  accountName: string;
  amount: string;
  matchCode: string;
  /** Ảnh QR động của SePay (qr.sepay.vn) — quét là ra sẵn số tiền + nội dung. */
  qrImageUrl: string;
}

/** Dựng hướng dẫn thanh toán SePay cho một intent. Tài khoản nhận lấy từ env
 * nền tảng (KHÔNG hardcode credential). Nội dung `des` chính là matchCode để
 * webhook "tiền vào" khớp đúng intent. */
export function buildSepayPayInstruction(matchCode: string, amount: string | bigint): SepayPayInstruction {
  const amountText = amount.toString();
  // Với VA SePay, nội dung phải chứa tiền tố VA (VD TKPCTN) để nhận diện đúng
  // tài khoản; mã đối soát (KLT.../WD...) đặt ngay sau. Webhook vẫn trích được
  // matchCode bằng regex nên phần khớp intent không đổi.
  const des = `${env.sepayVaPrefix}${matchCode}`;
  const qs = new URLSearchParams({
    acc: env.sepayReceiverAccount,
    bank: env.sepayReceiverBank,
    amount: amountText,
    des,
    template: 'compact',
  });
  return {
    bankCode: env.sepayReceiverBank,
    accountNumber: env.sepayReceiverAccount,
    accountName: env.sepayReceiverName,
    amount: amountText,
    matchCode,
    qrImageUrl: `https://qr.sepay.vn/img?${qs.toString()}`,
  };
}
