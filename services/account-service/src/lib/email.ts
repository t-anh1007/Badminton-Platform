/** Cổng gửi email — GĐ1 chưa có SMTP thật, chỉ log. Business logic (ACC-01,
 * ACC-02, ACC-05) không phụ thuộc cách gửi thật, chỉ gọi cổng này. */
export interface EmailSender {
  send(to: string, subject: string, body: string): Promise<void>;
}

export const emailSender: EmailSender = {
  async send(to, subject, body) {
    // eslint-disable-next-line no-console
    console.log(`[email:dev-stub] to=${to} subject="${subject}"\n${body}`);
  },
};
