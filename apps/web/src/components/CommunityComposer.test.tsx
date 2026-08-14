import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CommunityComposer } from './CommunityComposer.js';
import { CommunityMediaGrid } from './CommunityMediaGrid.js';

const authorize = vi.fn();
const upload = vi.fn();
const createPost = vi.fn();
vi.mock('../lib/communityApi.js', () => ({
  authorizeCommunityPostImage: (...args: unknown[]) => authorize(...args),
  uploadAuthorizedFile: (...args: unknown[]) => upload(...args),
  createCommunityPost: (...args: unknown[]) => createPost(...args),
}));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it('authorizes, PUTs and submits only uploaded Community image metadata', async () => {
  vi.stubGlobal('alert', vi.fn());
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() });
  authorize.mockResolvedValue({ objectKey: 'community/posts/u/image.jpg', uploadUrl: 'https://storage.test/put', headers: {}, expiresAt: 'x' });
  upload.mockImplementation(async (_authorization: unknown, _file: File, progress: (value: number) => void) => progress(100));
  createPost.mockResolvedValue({ id: 'post' });
  const published = vi.fn();
  render(<CommunityComposer onPublished={published} />);
  fireEvent.change(screen.getByLabelText('Nội dung bài viết'), { target: { value: 'Xin chào' } });
  fireEvent.change(screen.getByLabelText('Thêm ảnh bài viết'), { target: { files: [new File(['image'], 'ảnh.jpg', { type: 'image/jpeg' })] } });
  await waitFor(() => expect(screen.getByText('Đã tải')).toBeInTheDocument());
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  fireEvent.click(screen.getByRole('button', { name: 'Đăng bài' }));
  await waitFor(() => expect(createPost).toHaveBeenCalledWith('Xin chào', [expect.objectContaining({ objectKey: 'community/posts/u/image.jpg', position: 0 })]));
  expect(authorize).toHaveBeenCalledWith('image/jpeg');
  expect(upload).toHaveBeenCalled();
});

it('limits Community selection to four and revokes preview URLs on remove', async () => {
  const revoke = vi.fn();
  vi.stubGlobal('alert', vi.fn());
  vi.stubGlobal('URL', { createObjectURL: vi.fn((file: File) => `blob:${file.name}`), revokeObjectURL: revoke });
  authorize.mockResolvedValue({ objectKey: 'community/posts/u/image.jpg', uploadUrl: 'https://storage.test/put', headers: {}, expiresAt: 'x' });
  upload.mockResolvedValue(undefined);
  render(<CommunityComposer onPublished={vi.fn()} />);
  const files = Array.from({ length: 5 }, (_, index) => new File(['image'], `${index}.jpg`, { type: 'image/jpeg' }));
  fireEvent.change(screen.getByLabelText('Thêm ảnh bài viết'), { target: { files } });
  await waitFor(() => expect(authorize).toHaveBeenCalledTimes(4));
  fireEvent.click(screen.getAllByRole('button', { name: 'Gỡ' })[0]);
  expect(revoke).toHaveBeenCalledWith('blob:0.jpg');
});

it('keeps a failed file removable or retryable without discarding composer text', async () => {
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:failed'), revokeObjectURL: vi.fn() });
  authorize.mockResolvedValue({ objectKey: 'community/posts/u/retry.jpg', uploadUrl: 'https://storage.test/put', headers: {}, expiresAt: 'x' });
  upload.mockRejectedValueOnce(new Error('Mạng chập chờn')).mockResolvedValueOnce(undefined);
  render(<CommunityComposer onPublished={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Nội dung bài viết'), { target: { value: 'Giữ nguyên nội dung' } });
  fireEvent.change(screen.getByLabelText('Thêm ảnh bài viết'), { target: { files: [new File(['image'], 'retry.jpg', { type: 'image/jpeg' })] } });
  await screen.findByRole('button', { name: 'Thử lại' });
  expect(screen.getByLabelText('Nội dung bài viết')).toHaveValue('Giữ nguyên nội dung');
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
});

it('renders lazy cover media and closes its lightbox with Escape', () => {
  render(<CommunityMediaGrid images={[{ objectKey: 'https://cdn.test/post.jpg', width: 20, height: 10, alt: 'Ảnh sân', position: 0 }]} />);
  const image = screen.getByAltText('Ảnh sân');
  expect(image).toHaveAttribute('loading', 'lazy');
  expect(image).toHaveClass('object-cover');
  fireEvent.click(image);
  expect(screen.getByRole('dialog', { name: 'Xem ảnh' })).toBeInTheDocument();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: 'Xem ảnh' })).not.toBeInTheDocument();
});
