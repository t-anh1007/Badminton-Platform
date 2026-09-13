import nodemailer, { type Transporter } from 'nodemailer';
import { OAuth2Client } from 'google-auth-library';

/** Cổng gửi email — ưu tiên Gmail API qua HTTPS, giữ SMTP cho local/fallback. */
export interface EmailSender {
  send(to: string, subject: string, body: string): Promise<void>;
}

export interface EmailConfig {
  from?: string;
  gmailClientId?: string;
  gmailClientSecret?: string;
  gmailRefreshToken?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
}

type GmailAccessTokenProvider = () => Promise<string>;

function encodeHeader(value: string) {
  return /[^\x20-\x7E]/.test(value)
    ? `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
    : value;
}

function createGmailAccessTokenProvider(config: EmailConfig): GmailAccessTokenProvider | null {
  if (!config.gmailClientId || !config.gmailClientSecret || !config.gmailRefreshToken) return null;
  const client = new OAuth2Client(config.gmailClientId, config.gmailClientSecret);
  client.setCredentials({ refresh_token: config.gmailRefreshToken });
  return async () => {
    const { token } = await client.getAccessToken();
    if (!token) throw new Error('Gmail API did not return an access token');
    return token;
  };
}

export function createEmailSender(
  config: EmailConfig,
  request: typeof fetch = fetch,
  gmailAccessToken = createGmailAccessTokenProvider(config),
): EmailSender {
  const from = config.from ?? config.smtpUser ?? 'noreply@courtin.local';
  if (gmailAccessToken) {
    return {
      async send(to, subject, body) {
        const raw = Buffer.from([
          `From: ${from}`,
          `To: ${to}`,
          `Subject: ${encodeHeader(subject)}`,
          'MIME-Version: 1.0',
          'Content-Type: text/plain; charset=UTF-8',
          'Content-Transfer-Encoding: 8bit',
          '',
          body,
        ].join('\r\n'), 'utf8').toString('base64url');
        const response = await request('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${await gmailAccessToken()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw }),
        });
        if (!response.ok) {
          throw new Error(`Gmail email API failed with status ${response.status}`);
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
      await transporter.sendMail({ from, to, subject, text: body });
    },
  };
}

export const emailSender = createEmailSender({
  from: process.env.EMAIL_FROM ?? process.env.SMTP_FROM,
  gmailClientId: process.env.GMAIL_CLIENT_ID,
  gmailClientSecret: process.env.GMAIL_CLIENT_SECRET,
  gmailRefreshToken: process.env.GMAIL_REFRESH_TOKEN,
  smtpHost: process.env.SMTP_HOST,
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
});
