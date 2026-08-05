import { useState } from 'react';
import { SlotGrid } from '../components/SlotGrid';
import { MOCK_COURTS } from '../data/mock';

/** Đếm ngược giữ chỗ 10 phút — baseline UI, logic thật (Redis) thuộc G3. */
function HoldCountdown() {
  return (
    <div className="text-figures rounded-full bg-accent-red/10 px-4 py-2 text-sm text-accent-red">
      Giữ chỗ còn <span className="font-semibold">09:47</span>
    </div>
  );
}

export function BookingPage() {
  const [step, setStep] = useState(1);

  return (
    <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-h2">Đặt sân</h1>
        <HoldCountdown />
      </div>

      <div className="mb-6 flex gap-2">
        {['Chọn slot', 'Xác nhận', 'Thanh toán'].map((label, i) => (
          <div
            key={label}
            className={`text-caption rounded-full px-3 py-1 ${
              step === i + 1 ? 'bg-primary-navy text-on-dark' : 'bg-bg-white text-text-primary/50'
            }`}
          >
            {i + 1}. {label}
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {MOCK_COURTS.map((court) => (
          <SlotGrid key={court.name} courtName={court.name} slots={court.slots} />
        ))}
      </div>

      <div className="mt-8 flex justify-end">
        <button
          type="button"
          onClick={() => setStep((s) => (s < 3 ? s + 1 : 1))}
          className="rounded-full bg-accent-shuttle px-6 py-3 text-caption text-court-green transition-transform hover:-translate-y-0.5"
        >
          Tiếp tục (mock)
        </button>
      </div>
    </div>
  );
}
