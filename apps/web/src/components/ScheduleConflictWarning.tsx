import type { ScheduleConflict } from '../lib/matchApi.js';
import { formatDateTimeVi } from '../lib/formatters.js';
import { Button, Modal } from './ui.js';

export function ScheduleConflictWarning({
  conflicts,
  onClose,
  onContinue,
}: {
  conflicts: ScheduleConflict[];
  onClose: () => void;
  onContinue: () => void;
}) {
  return (
    <Modal open={conflicts.length > 0} title="Cảnh báo trùng lịch" onClose={onClose}>
      <p className="text-sm text-ink-700">
        Bạn đã có lịch trùng khung giờ này. Một người chơi không thể có mặt ở hai sân cùng lúc;
        chỉ tiếp tục nếu đây là lượt đặt hộ hoặc bạn đã chủ động sắp xếp người chơi khác.
      </p>
      <ul className="mt-4 space-y-3">
        {conflicts.map((conflict, index) => (
          <li key={`${conflict.kind}-${conflict.startAt}-${index}`} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">{conflict.venue.name} · {conflict.court.name}</p>
            <p>{formatDateTimeVi(conflict.startAt)} – {formatDateTimeVi(conflict.endAt)}</p>
            <p>{conflict.kind === 'match' ? 'Kèo ghép đôi đang hoạt động' : 'Lượt đặt sân đang hoạt động'}</p>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex justify-end gap-2">
        <Button tone="secondary" onClick={onClose}>Quay lại</Button>
        <Button onClick={onContinue}>Vẫn tiếp tục</Button>
      </div>
    </Modal>
  );
}
