import nodemailer, { type Transporter } from 'nodemailer';

/** Cổng gửi email — ưu tiên HTTP API ở production, giữ SMTP cho local/fallback. */
export interface EmailSender {
  send(to: string, subject: string, body: string): Promise<void>;
}

export interface EmailConfig {
  resendApiKey?: string;
  from?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
}

const htmlBody = (body: string) => `<p style="font-family:system-ui;font-size:15px;line-height:1.6">${body.replace(/\n/g, '<br/>')}</p>`;

export function createEmailSender(config: EmailConfig, request: typeof fetch = fetch): EmailSender {
  const from = config.from ?? config.smtpUser ?? 'noreply@courtin.local';
  if (config.resendApiKey) {
    return {
      async send(to, subject, body) {
        const response = await request('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from, to: [to], subject, text: body, html: htmlBody(body) }),
        });
        if (!response.ok) {
          throw new Error(`Resend email API failed with status ${response.status}`);
        }
      },
    };
  }

  let transporter: Transporter | null = null;
  if (config.smtpHost && config.smtpUser && config.smtpPass) {
    const port = config.smtpPort ?? 587;
    transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port,
      secure: port === 465,
      auth: { user: config.smtpUser, pass: config.smtpPass },
      connectionTimeout: 8_000,
      greetingTimeout: 8_000,
      socketTimeout: 10_000,
    });
  }

  return {
    async send(to, subject, body) {
      if (!transporter) {
        // eslint-disable-next-line no-console
        console.log(`[email:dev-stub] to=${to} subject="${subject}"\n${body}`);
        return;
      }
      await transporter.sendMail({ from, to, subject, text: body, html: htmlBody(body) });
    },
  };
}

export const emailSender = createEmailSender({
  resendApiKey: process.env.RESEND_API_KEY,
  from: process.env.EMAIL_FROM ?? process.env.SMTP_FROM,
  smtpHost: process.env.SMTP_HOST,
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
});
