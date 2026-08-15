import { useEffect, useState } from 'react';
import type { CommunityPostImage } from '../lib/communityApi';

export function CommunityMediaGrid({ images }: { images?: CommunityPostImage[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpenIndex(null); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, []);
  if (!images?.length) return null;
  const selected = openIndex === null ? null : images[openIndex];
  return <><div className="community-media-grid">{images.map((image, index) => <button type="button" key={image.objectKey} onClick={() => setOpenIndex(index)} className="overflow-hidden rounded-xl"><img src={image.objectKey} alt={image.alt} loading="lazy" className="h-48 w-full object-cover" /></button>)}</div>{selected && <div className="media-lightbox" role="dialog" aria-modal="true" aria-label="Xem ảnh"><button type="button" aria-label="Đóng ảnh" onClick={() => setOpenIndex(null)}><img src={selected.objectKey} alt={selected.alt} className="max-h-[85vh] max-w-[92vw] object-contain" /></button></div>}</>;
}
