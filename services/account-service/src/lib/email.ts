import nodemailer, { type Transporter } from 'nodemailer';

/** Cổng gửi email — dùng SMTP thật khi có ENV SMTP_HOST, fallback về console log. */
export interface EmailSender {
  send(to: string, subject: string, body: string): Promise<void>;
}

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT ?? 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.SMTP_FROM ?? user ?? 'noreply@courtin.local';

let transporter: Transporter | null = null;
if (host && user && pass) {
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    // SMTP không phản hồi ở production không được giữ request đăng ký/đặt lại
    // mật khẩu mở vô thời hạn. Caller đã xử lý lỗi gửi mail như một lỗi không
    // rollback được, nên trả quyền điều khiển lại cho người dùng sớm.
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 10_000,
  });
}

export const emailSender: EmailSender = {
  async send(to, subject, body) {
    if (!transporter) {
      // eslint-disable-next-line no-console
      console.log(`[email:dev-stub] to=${to} subject="${subject}"\n${body}`);
      return;
    }
    await transporter.sendMail({
      from,
      to,
      subject,
      text: body,
      html: `<p style="font-family:system-ui;font-size:15px;line-height:1.6">${body.replace(/\n/g, '<br/>')}</p>`,
    });
  },
};
