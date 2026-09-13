import { describe, expect, it, vi } from 'vitest';
import { createEmailSender } from '../src/lib/email.js';

describe('EmailSender', () => {
  it('sends transactional email through the Resend HTTPS API when configured', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'email-1' }), { status: 200 }));
    const sender = createEmailSender(
      {
        resendApiKey: 'resend-test-key',
        from: 'COURTIN <noreply@example.com>',
      },
      request,
    );

    await sender.send('player@example.com', 'Mã xác minh', 'Mã của bạn là: 123456');

    expect(request).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer resend-test-key',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          from: 'COURTIN <noreply@example.com>',
          to: ['player@example.com'],
          subject: 'Mã xác minh',
          text: 'Mã của bạn là: 123456',
          html: '<p style="font-family:system-ui;font-size:15px;line-height:1.6">Mã của bạn là: 123456</p>',
        }),
      }),
    );
  });
});
