import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { getRecentCoPlayers, invitePartner, type MatchDetail, type RecentCoPlayer } from '../lib/matchApi'
import { PartnerInvitePanel } from './PartnerInvitePanel'

vi.mock('../lib/matchApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/matchApi')>()),
  getRecentCoPlayers: vi.fn(), invitePartner: vi.fn(),
}))

// BR-CM-79/80: thẻ mời đồng đội — 3 cách mời, danh sách từng chơi cùng 5 người/trang.

const players: RecentCoPlayer[] = Array.from({ length: 20 }, (_, index) => ({
  userId: `u-${index + 1}`, displayName: `Người ${index + 1}`, avatarUrl: null,
  relation: index % 2 ? 'opponent' : 'teammate', timesPlayed: 1, lastPlayedAt: '2026-09-28T10:00:00.000Z',
}))
const detail = {
  id: 'm-1', feePerSlot: '50000', actions: { isOrganizer: true },
  partner: { invite: null, prepaidJoin: null, actions: { canInvite: true, canCancel: false, canPayPrepaid: false, canRespond: false } },
} as unknown as MatchDetail
const run = async (operation: () => Promise<unknown>) => { await operation() }

afterEach(cleanup)

it('phân trang 5 người mỗi trang, 4 trang cho 20 người', async () => {
  vi.mocked(getRecentCoPlayers).mockResolvedValue({ players })
  render(<PartnerInvitePanel detail={detail} run={run} />)
  await screen.findByText('Người 1')
  expect(screen.getAllByRole('radio')).toHaveLength(5)
  expect(screen.getByText('Trang 1/4')).toBeInTheDocument()
  for (let page = 2; page <= 4; page += 1) fireEvent.click(screen.getByRole('button', { name: 'Sau' }))
  expect(screen.getByText('Trang 4/4')).toBeInTheDocument()
  expect(screen.getByText('Người 20')).toBeInTheDocument()
  expect(screen.queryByText('Người 15')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sau' })).toBeDisabled()
})

it('tìm theo tên quay về trang 1 và gửi lời mời theo userId', async () => {
  vi.mocked(getRecentCoPlayers).mockResolvedValue({ players })
  vi.mocked(invitePartner).mockResolvedValue({ prepaidJoinId: null })
  render(<PartnerInvitePanel detail={detail} run={run} />)
  await screen.findByText('Người 1')
  fireEvent.click(screen.getByRole('button', { name: 'Sau' }))
  fireEvent.change(screen.getByLabelText('Tìm người từng chơi cùng'), { target: { value: 'Người 12' } })
  expect(screen.getAllByRole('radio')).toHaveLength(1)
  fireEvent.click(screen.getByRole('radio'))
  fireEvent.click(screen.getByRole('button', { name: 'Gửi lời mời' }))
  await waitFor(() => expect(invitePartner).toHaveBeenCalledWith('m-1', { userId: 'u-12' }, 'self'))
})

it('chưa từng chơi kèo nào thì mở sẵn ô email; đổi sang SĐT gửi theo phone', async () => {
  vi.mocked(getRecentCoPlayers).mockResolvedValue({ players: [] })
  vi.mocked(invitePartner).mockResolvedValue({ prepaidJoinId: null })
  render(<PartnerInvitePanel detail={detail} run={run} />)
  await screen.findByLabelText('Email của đồng đội')
  fireEvent.click(screen.getByRole('button', { name: 'Số điện thoại' }))
  fireEvent.change(screen.getByLabelText('Số điện thoại của đồng đội'), { target: { value: '0912345678' } })
  fireEvent.click(screen.getByRole('button', { name: 'Gửi lời mời' }))
  await waitFor(() => expect(invitePartner).toHaveBeenCalledWith('m-1', { phone: '0912345678' }, 'self'))
})
