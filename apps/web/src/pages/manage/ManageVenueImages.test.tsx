import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ManageVenuesPage } from './ManageVenuesPage.js';

const createVenue = vi.fn();
const authorize = vi.fn();
const upload = vi.fn();
vi.mock('../../lib/venueBookingApi.js', () => ({
  getMyManagedVenues: vi.fn().mockResolvedValue([]),
  createManagedVenue: (...args: unknown[]) => createVenue(...args),
  authorizeVenueImage: (...args: unknown[]) => authorize(...args),
  uploadVenueImage: (...args: unknown[]) => upload(...args),
}));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it('uses the provider-owned authorize then upload state before submitting venue metadata', async () => {
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:venue'), revokeObjectURL: vi.fn() });
  authorize.mockResolvedValue({ objectKey: 'venue/images/picture.webp', uploadUrl: 'https://storage.test/put', headers: {}, expiresAt: 'x' });
  upload.mockImplementation(async (_auth: unknown, _file: File, progress: (value: number) => void) => progress(100));
  createVenue.mockResolvedValue({});
  render(<ManageVenuesPage />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Thêm sân kinh doanh' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Thêm sân kinh doanh' }));
  fireEvent.change(screen.getByLabelText('Tên cơ sở'), { target: { value: 'Sân A' } });
  fireEvent.change(screen.getByLabelText('Địa chỉ'), { target: { value: 'Q1' } });
  fireEvent.change(screen.getByLabelText('Vĩ độ'), { target: { value: '10' } });
  fireEvent.change(screen.getByLabelText('Kinh độ'), { target: { value: '106' } });
  fireEvent.change(screen.getByLabelText('Ảnh cơ sở'), { target: { files: [new File(['image'], 'venue.webp', { type: 'image/webp' })] } });
  await waitFor(() => expect(screen.getByText('Đã tải')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Lưu cơ sở' }));
  await waitFor(() => expect(createVenue).toHaveBeenCalledWith(expect.objectContaining({ images: [{ objectKey: 'venue/images/picture.webp' }] })));
  expect(authorize).toHaveBeenCalledWith('image/webp');
});
