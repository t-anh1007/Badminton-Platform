export type ShutdownCancellationMode = 'scheduled_close' | 'emergency';

export interface ShutdownBookingCancelledInput {
  bookingId: string;
  userId: string;
  businessUserId: string;
  gross: string;
  shutdownId: string;
  bookingBusinessCode: string;
  mode: ShutdownCancellationMode;
}

export function bookingCancelledPayload(input: ShutdownBookingCancelledInput) {
  return {
    bookingId: input.bookingId,
    userId: input.userId,
    businessUserId: input.businessUserId,
    gross: input.gross,
    refundPercent: 100 as const,
    reason: 'provider_fault' as const,
    cancellationNote: input.mode === 'emergency' ? 'Ngừng hoạt động do sự cố' : 'Đóng cửa từ ngày đã chọn',
    shutdownId: input.shutdownId,
    bookingBusinessCode: input.bookingBusinessCode,
  };
}
