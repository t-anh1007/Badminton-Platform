/** Mọi link trong email trỏ về web production; đặt EMAIL_LINK_ORIGIN để đổi (vd. thử ở local). */
export const emailLinkOrigin = (process.env.EMAIL_LINK_ORIGIN ?? 'https://courtin-web.vercel.app').replace(/\/+$/, '');

export const emailLink = (path: string) => `${emailLinkOrigin}${path}`;

export type EmailContent = {
  /** Tiêu đề lớn trong thư. */
  heading: string;
  greetingName?: string | null;
  paragraphs: string[];
  /** Ô thông tin dạng nhãn: giá trị. */
  details?: Array<[string, string]>;
  action?: { label: string; url: string };
  /** Lý do người dùng nhận thư, in nhỏ ở cuối. */
  reason: string;
};

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Dựng thư giao dịch Courtin: bản text (luôn có) và bản HTML có nút bấm. */
export function renderEmail(content: EmailContent): { text: string; html: string } {
  const greeting = content.greetingName ? `Xin chào ${content.greetingName},` : 'Xin chào,';
  const text = [
    greeting,
    '',
    content.heading,
    '',
    ...content.paragraphs.flatMap((paragraph) => [paragraph, '']),
    ...(content.details?.length ? [...content.details.map(([label, value]) => `- ${label}: ${value}`), ''] : []),
    ...(content.action ? [`${content.action.label}: ${content.action.url}`, ''] : []),
    '—',
    'Courtin — Đặt sân, tìm kèo cầu lông',
    emailLinkOrigin,
    content.reason,
  ].join('\n');

  const details = content.details?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;background:#f4f7f5;border-radius:8px">${
      content.details.map(([label, value]) => `<tr><td style="padding:8px 12px;color:#5b6660;font-size:14px;width:40%">${escapeHtml(label)}</td><td style="padding:8px 12px;font-size:14px;font-weight:600;color:#14211a">${escapeHtml(value)}</td></tr>`).join('')
    }</table>`
    : '';
  const action = content.action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(content.action.url)}" style="display:inline-block;background:#16794a;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">${escapeHtml(content.action.label)}</a></p>
<p style="margin:0 0 16px;font-size:12px;color:#5b6660">Nếu nút không bấm được, mở đường dẫn sau: <a href="${escapeHtml(content.action.url)}" style="color:#16794a;word-break:break-all">${escapeHtml(content.action.url)}</a></p>`
    : '';
  const html = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef2ef;font-family:Arial,Helvetica,sans-serif;color:#14211a">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#eef2ef"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:12px">
<tr><td style="padding:20px 24px;border-bottom:1px solid #e3e9e5;font-size:18px;font-weight:700;color:#16794a">COURTIN</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 12px;font-size:15px">${escapeHtml(greeting)}</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${escapeHtml(content.heading)}</h1>
${content.paragraphs.map((paragraph) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">${escapeHtml(paragraph)}</p>`).join('\n')}
${details}
${action}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e3e9e5;font-size:12px;color:#5b6660;line-height:1.5">
Courtin — Đặt sân, tìm kèo cầu lông · <a href="${escapeHtml(emailLinkOrigin)}" style="color:#16794a">${escapeHtml(emailLinkOrigin.replace(/^https?:\/\//, ''))}</a><br>${escapeHtml(content.reason)}
</td></tr>
</table></td></tr></table>
</body></html>`;
  return { text, html };
}

/** Thư mã xác minh / đặt lại mật khẩu: mã nổi bật, hạn dùng và link tới đúng trang nhập mã. */
export function codeEmail(input: { heading: string; intro: string; code: string; ttlMinutes: number; path: string; actionLabel: string }) {
  return renderEmail({
    heading: input.heading,
    paragraphs: [input.intro, 'Không chia sẻ mã này với bất kỳ ai, kể cả người tự xưng là nhân viên Courtin.'],
    details: [['Mã của bạn', input.code], ['Hiệu lực', `${input.ttlMinutes} phút kể từ lúc gửi`]],
    action: { label: input.actionLabel, url: emailLink(input.path) },
    reason: 'Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email; tài khoản của bạn vẫn an toàn.',
  });
}
