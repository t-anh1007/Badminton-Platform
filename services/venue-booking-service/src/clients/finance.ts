import { AppError } from '../lib/errors.js';

export interface ShutdownRefundPreviewClient {
  getPaidAmounts(bookingIds: string[]): Promise<Record<string, string>>;
}

export class HttpShutdownRefundPreviewClient implements ShutdownRefundPreviewClient {
  async getPaidAmounts(bookingIds: string[]): Promise<Record<string, string>> {
    if (bookingIds.length === 0) return {};
    const message = 'Chưa thể tính tổng tiền hoàn. Vui lòng thử lại.';
    const token = process.env.INTERNAL_SERVICE_TOKEN;
    if (!token) throw new AppError('FINANCE_PREVIEW_UNAVAILABLE', message, 503);
    const baseUrl = process.env.FINANCE_URL ?? process.env.FINANCE_SERVICE_URL ?? 'http://localhost:3003';
    try {
      const result: Record<string, string> = {};
      for (let offset = 0; offset < bookingIds.length; offset += 500) {
        const batch = bookingIds.slice(offset, offset + 500);
        const response = await fetch(`${baseUrl}/internal/shutdown-refund-preview`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-internal-service-token': token },
          body: JSON.stringify({ bookingIds: batch }),
        });
        if (!response.ok) throw new Error('Finance preview request failed');
        const body: unknown = await response.json();
        if (!body || typeof body !== 'object' || !('amountByBookingId' in body)) throw new Error('Invalid Finance preview');
        const amounts = (body as { amountByBookingId: unknown }).amountByBookingId;
        if (!amounts || typeof amounts !== 'object' || Array.isArray(amounts)) throw new Error('Invalid Finance amounts');
        for (const id of batch) {
          const amount = (amounts as Record<string, unknown>)[id];
          if (typeof amount !== 'string' || !/^\d+$/.test(amount)) throw new Error('Invalid Finance amount');
          result[id] = amount;
        }
      }
      return result;
    } catch {
      throw new AppError('FINANCE_PREVIEW_UNAVAILABLE', message, 503);
    }
  }
}
