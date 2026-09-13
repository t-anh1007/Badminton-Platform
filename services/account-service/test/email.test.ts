import { describe, expect, it, vi } from 'vitest';
import { createEmailSender } from '../src/lib/email.js';

describe('EmailSender', () => {
  it('sends transactional email through the Gmail HTTPS API when configured', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'email-1' }), { status: 200 }));
    const sender = createEmailSender(
      {
        from: 'sender@example.com',
      },
      request,
      async () => 'gmail-test-token',
    );

    await sender.send('player@example.com', 'Mã xác minh', 'Mã của bạn là: 123456');

    expect(request).toHaveBeenCalledWith(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer gmail-test-token',
          'Content-Type': 'application/json',
        }),
        body: expect.stringContaining('raw'),
      }),
    );
    const payload = JSON.parse(request.mock.calls[0]![1]!.body as string);
    expect(Buffer.from(payload.raw, 'base64url').toString('utf8')).toBe([
      'From: sender@example.com',
      'To: player@example.com',
      'Subject: =?UTF-8?B?TcOjIHjDoWMgbWluaA==?=',
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      'Mã của bạn là: 123456',
    ].join('\r\n'));
  });
});
