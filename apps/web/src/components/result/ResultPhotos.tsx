import { useEffect, useState } from 'react';
import { readResultPhoto, type ResultImageView } from '../../lib/resultApi';
import { formatTimeVi } from '../../lib/formatters.js';
import { LevelBadge, reasonText } from './shared';

/** Ảnh đã gửi của hồ sơ (bucket riêng, URL ký ngắn hạn) kèm số AI đọc và giờ chụp (BR-RA-06). */
export function ResultPhotos({ matchId, images, title }: { matchId: string; images: ResultImageView[]; title?: string }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    void Promise.allSettled(images.map(async (image) => [image.id, (await readResultPhoto(matchId, image.id)).url] as const)).then((rows) => {
      if (active) setUrls(Object.fromEntries(rows.flatMap((row) => (row.status === 'fulfilled' ? [row.value] : []))));
    });
    return () => { active = false; };
  }, [matchId, images]);
  if (images.length === 0) return null;
  return (
    <div>
      {title && <p className="font-bold text-ink-900">{title}</p>}
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {images.map((image, index) => {
          const read = image.aiReading?.sets.map((set) => `${set.left}–${set.right}`).join(', ');
          const flags = image.flags.map(reasonText).filter(Boolean);
          return (
            <figure key={image.id} className="m-0">
              <a href={urls[image.id]} target="_blank" rel="noreferrer" aria-label={`Mở ảnh ${index + 1}`}
                className="relative block h-36 overflow-hidden rounded-xl border border-line bg-canvas">
                {urls[image.id] ? <img src={urls[image.id]} alt={`Ảnh ${index + 1}`} className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-sm text-ink-500">Ảnh {index + 1}</span>}
                {image.level && <span className="absolute right-2 top-2"><LevelBadge level={image.level} /></span>}
              </a>
              <figcaption className="mt-1.5 text-[13px] text-ink-500">
                {read ? <>AI đọc <b className="text-figures text-ink-900">{read}</b></> : 'AI chưa đọc được'}
                {image.capturedAt ? `. Chụp ${formatTimeVi(image.capturedAt)}` : '. Không có giờ chụp'}
                {flags.length > 0 && <span className="block">{flags.join('. ')}</span>}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
