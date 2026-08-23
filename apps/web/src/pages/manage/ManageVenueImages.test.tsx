import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ManageVenuesPage } from './ManageVenuesPage.js';

const createVenue = vi.fn();
const addCourt = vi.fn();
const authorize = vi.fn();
const upload = vi.fn();
vi.mock('../../lib/venueBookingApi.js', () => ({
  getMyManagedVenues: vi.fn().mockResolvedValue([]),
  createManagedVenue: (...args: unknown[]) => createVenue(...args),
  addManagedCourt: (...args: unknown[]) => addCourt(...args),
  replaceOperatingHours: vi.fn().mockResolvedValue({}),
  savePricing: vi.fn().mockResolvedValue({}),
  saveBookingRule: vi.fn().mockResolvedValue({}),
  authorizeVenueImage: (...args: unknown[]) => authorize(...args),
  uploadVenueImage: (...args: unknown[]) => upload(...args),
}));

// Leaflet không chạy trong jsdom → thay picker bằng nút đặt toạ độ cố định.
vi.mock('../../components/map/LocationPicker.js', () => ({
  LocationPicker: ({ onChange }: { onChange: (next: { lat: number; lng: number }) => void }) => (
    <button type="button" onClick={() => onChange({ lat: 10, lng: 106 })}>đặt vị trí</button>
  ),
}));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it('uses the provider-owned authorize then upload state before submitting venue metadata', async () => {
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:venue'), revokeObjectURL: vi.fn() });
  authorize.mockResolvedValue({ objectKey: 'venue/images/picture.webp', uploadUrl: 'https://storage.test/put', headers: {}, expiresAt: 'x' });
  upload.mockImplementation(async (_auth: unknown, _file: File, progress: (value: number) => void) => progress(100));
  createVenue.mockResolvedValue({ id: 'v1' });
  addCourt.mockResolvedValue({ id: 'c1' });
  render(<ManageVenuesPage />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Thêm sân kinh doanh' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Thêm sân kinh doanh' }));
  fireEvent.change(screen.getByLabelText('Tên cơ sở'), { target: { value: 'Sân A' } });
  fireEvent.change(screen.getByLabelText('Địa chỉ'), { target: { value: 'Q1' } });
  fireEvent.click(screen.getByRole('button', { name: 'đặt vị trí' }));
  fireEvent.change(screen.getByLabelText('Tên sân con mới'), { target: { value: 'Sân 1' } });
  fireEvent.click(screen.getByRole('button', { name: '+ Thêm sân' }));
  fireEvent.change(screen.getByLabelText('Ảnh Sân 1 (bắt buộc 1–5 ảnh)'), { target: { files: [new File(['court'], 'court.webp', { type: 'image/webp' })] } });
  fireEvent.change(screen.getByLabelText('Ảnh cơ sở'), { target: { files: [new File(['image'], 'venue.webp', { type: 'image/webp' })] } });
  await waitFor(() => expect(screen.getAllByText('Đã tải')).toHaveLength(2));
  fireEvent.click(screen.getByRole('button', { name: 'Lưu và hoàn tất cấu hình' }));
  await waitFor(() => expect(createVenue).toHaveBeenCalledWith(expect.objectContaining({ images: [{ objectKey: 'venue/images/picture.webp' }] })));
  expect(authorize).toHaveBeenCalledWith('image/webp');
});
