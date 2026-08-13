import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, SelectInput } from './ui';
import type { MatchCourt, MatchVenue, SkillTier } from '../lib/matchApi';

interface Proposal {
  matchId: string;
  openSlots: number;
  feePerSlot: string;
  startAt: string;
  endAt: string;
  court: MatchCourt;
  venue: MatchVenue;
}
const tiers: Array<{ value: SkillTier; label: string }> = [
  { value: 'newcomer', label: 'Mới chơi' },
  { value: 'beginner', label: 'Yếu' },
  { value: 'intermediate', label: 'Trung bình' },
  { value: 'intermediate_plus', label: 'Trung bình khá' },
  { value: 'advanced', label: 'Bán chuyên' },
];

export function QuickMatchPanel() {
  const [skill, setSkill] = useState<SkillTier>('intermediate');
  const [state, setState] = useState<'idle' | 'connecting' | 'searching' | 'proposal' | 'joined' | 'error'>('idle');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [message, setMessage] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const navigate = useNavigate();

  useEffect(
    () => () => {
      socketRef.current?.disconnect();
    },
    [],
  );
  const find = () => {
    const accessToken = window.localStorage.getItem('accessToken');
    if (!accessToken) {
      navigate('/auth');
      return;
    }
    socketRef.current?.disconnect();
    setState('connecting');
    setProposal(null);
    setMessage('');
    const socket = io(import.meta.env.VITE_MATCHMAKING_WS_URL ?? window.location.origin, {
      auth: { token: accessToken },
    });
    socketRef.current = socket;
    socket.on('connect', () => {
      setState('searching');
      socket.emit('quick_match:find', { skill });
    });
    socket.on('quick_match:proposal', (next: Proposal) => {
      setProposal(next);
      setState('proposal');
    });
    socket.on('quick_match:joined', (join: { matchId: string }) => {
      setState('joined');
      setMessage('Yêu cầu đã gửi và đang chờ organizer duyệt.');
      window.setTimeout(() => navigate(`/matches/${join.matchId}`), 500);
    });
    socket.on('quick_match:error', (error: { message?: string }) => {
      setState('error');
      setMessage(error.message ?? 'Tìm nhanh đang gián đoạn.');
    });
    socket.on('connect_error', () => {
      setState('error');
      setMessage('Không thể kết nối Tìm nhanh. Hãy thử lại.');
    });
  };

  return (
    <section
      className="overflow-hidden rounded-2xl border border-line bg-[linear-gradient(120deg,#edf4f7_0%,#ffffff_70%)] p-5 shadow-[var(--shadow-card)]"
      aria-live="polite"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge tone="danger">Live</Badge>
            <h2 className="text-h3">Tìm nhanh một chỗ còn lại</h2>
          </div>
          <p className="mt-1 text-sm text-ink-500">
            Đề xuất theo bậc; chấp nhận chỉ tạo yêu cầu pending, chưa trừ tiền.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <SelectInput
            aria-label="Bậc Tìm nhanh"
            value={skill}
            onChange={(event) => setSkill(event.target.value as SkillTier)}
          >
            {tiers.map((tier) => (
              <option key={tier.value} value={tier.value}>
                {tier.label}
              </option>
            ))}
          </SelectInput>
          <Button onClick={find} disabled={state === 'connecting' || state === 'searching'}>
            {state === 'searching' ? 'Đang tìm…' : 'Tìm nhanh'}
          </Button>
        </div>
      </div>
      {proposal && (
        <div className="mt-4 animate-courtin-arrival rounded-xl border border-line bg-surface p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="font-semibold text-ink-900">
                {proposal.venue.name} · {proposal.court.name}
              </p>
              <p className="text-sm text-ink-500">
                {new Date(proposal.startAt).toLocaleString('vi-VN')} ·{' '}
                <span className="text-figures">{Number(proposal.feePerSlot).toLocaleString('vi-VN')}₫</span>
              </p>
            </div>
            <Button
              onClick={() =>
                socketRef.current?.emit('quick_match:accept', {
                  matchId: proposal.matchId,
                })
              }
            >
              Gửi yêu cầu pending
            </Button>
          </div>
        </div>
      )}
      {message && <p className={`mt-3 text-sm ${state === 'error' ? 'text-danger' : 'text-brand-navy'}`}>{message}</p>}
    </section>
  );
}
