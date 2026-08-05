import type { Slot } from '../components/SlotGrid';

/** Dữ liệu giả cho Gdesign — thay bằng gọi API thật ở G1..G7. */

export const MOCK_COURTS: { name: string; slots: Slot[] }[] = [
  {
    name: 'Sân 1 — Cơ sở Quận 7',
    slots: [
      { time: '06:00', status: 'available', price: 120000 },
      { time: '07:00', status: 'held', price: 120000 },
      { time: '08:00', status: 'booked', price: 150000 },
      { time: '09:00', status: 'available', price: 150000 },
    ],
  },
  {
    name: 'Sân 2 — Cơ sở Quận 7',
    slots: [
      { time: '06:00', status: 'available', price: 120000 },
      { time: '07:00', status: 'available', price: 120000 },
      { time: '08:00', status: 'available', price: 150000 },
      { time: '09:00', status: 'booked', price: 150000 },
    ],
  },
];

export const MOCK_ADMIN_PROVIDERS = [
  { id: 1, orgName: 'Nhà thi đấu Phú Nhuận', status: 'pending', submittedAt: '2026-08-01' },
  { id: 2, orgName: 'CLB Cầu lông Bình Thạnh', status: 'approved', submittedAt: '2026-07-28' },
  { id: 3, orgName: 'Sân Thảo Điền Badminton', status: 'rejected', submittedAt: '2026-07-20' },
];

export const MOCK_ADMIN_WITHDRAWALS = [
  { id: 'W-1042', sellerUserId: 'u_8821', amount: 2500000, status: 'pending' },
  { id: 'W-1041', sellerUserId: 'u_4410', amount: 1800000, status: 'paid' },
  { id: 'W-1039', sellerUserId: 'u_2201', amount: 900000, status: 'partially_paid' },
];

export const MOCK_BOOKING_HISTORY = [
  { id: 'BK-2201', court: 'Sân 1 — Q7', date: '2026-08-05', status: 'completed', price: 150000 },
  { id: 'BK-2198', court: 'Sân 2 — Q7', date: '2026-08-02', status: 'cancelled', price: 120000 },
];
