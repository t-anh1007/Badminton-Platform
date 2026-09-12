import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { SupportPage } from './SupportPage.js';

const authorizeTicketEvidence = vi.fn();
const uploadAuthorizedFile = vi.fn();

vi.mock('../lib/communityApi.js', () => ({
  getCommunitySession: () => ({ userId: 'user-1', roles: ['player'] }),
  listSupportTickets: vi.fn().mockResolvedValue({ tickets: [] }),
  getSupportTicket: vi.fn(), createSupportTicket: vi.fn(), addSupportTicketMessage: vi.fn(), setSupportTicketStatus: vi.fn(),
  authorizeTicketEvidence: (...args: unknown[]) => authorizeTicketEvidence(...args),
  uploadAuthorizedFile: (...args: unknown[]) => uploadAuthorizedFile(...args),
}));

it('keeps ticket subject focus/caret stable and restores its trigger when closed', async () => {
  render(<MemoryRouter><SupportPage /></MemoryRouter>);
  const trigger = (await screen.findAllByRole('button', { name: 'Tạo ticket mới' }))[0];
  fireEvent.click(trigger);
  const subject = await screen.findByPlaceholderText('Ví dụ: Không thấy booking trong tài khoản');
  await waitFor(() => expect(subject).toHaveFocus());
  fireEvent.change(subject, { target: { value: 'abc' } });
  expect(subject).toHaveValue('abc');
  expect(subject).toHaveFocus();
  const focusable = screen.getByRole('dialog').querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled])');
  focusable[focusable.length - 1].focus();
  fireEvent.keyDown(window, { key: 'Tab' });
  expect(focusable[0]).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
  await waitFor(() => expect(trigger).toHaveFocus());
});

it('uploads five ticket evidence images before creating the ticket', async () => {
  authorizeTicketEvidence.mockResolvedValue({ objectKey: 'community/tickets/user-1/proof.jpg', uploadUrl: 'https://storage.test/put', headers: {}, expiresAt: 'x' });
  uploadAuthorizedFile.mockResolvedValue(undefined);
  render(<MemoryRouter><SupportPage /></MemoryRouter>);
  fireEvent.click((await screen.findAllByRole('button', { name: 'Tạo ticket mới' }))[0]);
  const uploader = await screen.findByLabelText('Thêm ảnh bằng chứng cho ticket');
  const files = Array.from({ length: 5 }, (_, index) => new File(['proof'], `proof-${index}.jpg`, { type: 'image/jpeg' }));
  fireEvent.change(uploader, { target: { files } });
  await waitFor(() => expect(authorizeTicketEvidence).toHaveBeenCalledTimes(5));
});
