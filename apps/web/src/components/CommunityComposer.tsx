import { useEffect, useRef, useState } from 'react';
import {
  authorizeCommunityPostImage,
  createCommunityPost,
  uploadAuthorizedFile,
  type CommunityPostImage,
  type UploadAuthorization,
} from '../lib/communityApi';
import { Button, TextArea } from './ui';

type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';
type UploadStatus = 'uploading' | 'uploaded' | 'error';

export interface UploadImageState {
  id: string;
  file: File;
  previewUrl: string;
  status: UploadStatus;
  progress: number;
  error?: string;
  objectKey?: string;
  width: number;
  height: number;
}

export interface ImageUploadPickerProps {
  label: string;
  maxFiles?: number;
  authorize: (mimeType: ImageMimeType) => Promise<UploadAuthorization>;
  upload: (authorization: UploadAuthorization, file: File, onProgress: (progress: number) => void) => Promise<void>;
  onUploadedChange: (images: UploadImageState[]) => void;
}

const acceptedMimeTypes = new Set<ImageMimeType>(['image/jpeg', 'image/png', 'image/webp']);

function imageDimensions(previewUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
    image.onerror = () => resolve({ width: 1, height: 1 });
    image.src = previewUrl;
  });
}

export function ImageUploadPicker({ label, maxFiles = 4, authorize, upload, onUploadedChange }: ImageUploadPickerProps) {
  const [items, setItems] = useState<UploadImageState[]>([]);
  const itemsRef = useRef<UploadImageState[]>([]);
  const onUploadedChangeRef = useRef(onUploadedChange);
  useEffect(() => { onUploadedChangeRef.current = onUploadedChange; }, [onUploadedChange]);
  const commit = (next: UploadImageState[]) => { itemsRef.current = next; setItems(next); onUploadedChangeRef.current(next); };
  useEffect(() => { onUploadedChangeRef.current(itemsRef.current); }, []);
  useEffect(() => () => { itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl)); }, []);

  const update = (id: string, patch: Partial<UploadImageState>) => commit(itemsRef.current.map((item) => item.id === id ? { ...item, ...patch } : item));
  const startUpload = async (item: UploadImageState) => {
    update(item.id, { status: 'uploading', error: undefined, progress: 0 });
    try {
      const authorization = await authorize(item.file.type as ImageMimeType);
      await upload(authorization, item.file, (progress) => update(item.id, { progress }));
      update(item.id, { status: 'uploaded', objectKey: authorization.objectKey, progress: 100 });
    } catch (cause) {
      update(item.id, { status: 'error', error: cause instanceof Error ? cause.message : 'Không thể tải ảnh lên.' });
    }
  };
  const addFiles = (files: FileList | File[]) => {
    const next = Array.from(files).filter((file) => acceptedMimeTypes.has(file.type as ImageMimeType)).slice(0, Math.max(0, maxFiles - itemsRef.current.length));
    const invalid = Array.from(files).length - next.length;
    const records = next.map((file) => ({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), status: 'uploading' as const, progress: 0, width: 1, height: 1 }));
    if (invalid > 0) window.alert(`Chỉ chọn tối đa ${maxFiles} ảnh JPEG, PNG hoặc WebP.`);
    commit([...itemsRef.current, ...records]);
    records.forEach(async (record) => {
      void startUpload(record);
      const dimensions = await imageDimensions(record.previewUrl);
      update(record.id, dimensions);
    });
  };
  const remove = (id: string) => {
    const item = itemsRef.current.find((candidate) => candidate.id === id);
    if (item) URL.revokeObjectURL(item.previewUrl);
    commit(itemsRef.current.filter((candidate) => candidate.id !== id));
  };

  return <section className="media-picker" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }}>
    <label className="block rounded-xl border border-dashed border-line bg-canvas p-4 text-center text-sm font-medium text-ink-500">
      {label} (JPEG, PNG, WebP)
      <input aria-label={label} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = ''; }} />
    </label>
    {items.length > 0 && <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{items.map((item) => <figure key={item.id} className="relative overflow-hidden rounded-xl border border-line bg-canvas"><img src={item.previewUrl} alt={item.file.name} loading="lazy" className="h-28 w-full object-cover" /><figcaption className="p-2 text-xs"><span>{item.status === 'uploaded' ? 'Đã tải' : item.status === 'error' ? item.error : `Đang tải ${item.progress}%`}</span><div className="mt-2 flex gap-1"><Button size="sm" tone="secondary" onClick={() => remove(item.id)}>Gỡ</Button>{item.status === 'error' && <Button size="sm" onClick={() => void startUpload(item)}>Thử lại</Button>}</div></figcaption></figure>)}</div>}
  </section>;
}

export function CommunityComposer({ onPublished }: { onPublished: () => Promise<void> | void }) {
  const [body, setBody] = useState('');
  const [images, setImages] = useState<UploadImageState[]>([]);
  const [pickerVersion, setPickerVersion] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const pending = images.some((image) => image.status === 'uploading');
  const failed = images.some((image) => image.status === 'error');
  const publish = async () => {
    if (!body.trim() || pending || failed || submitting) return;
    setSubmitting(true); setError('');
    try {
      const metadata: CommunityPostImage[] = images.map((image, position) => ({ objectKey: image.objectKey!, width: image.width, height: image.height, alt: image.file.name, position }));
      await createCommunityPost(body.trim(), metadata);
      setBody('');
      setImages([]);
      setPickerVersion((version) => version + 1);
      await onPublished();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể đăng bài.'); }
    finally { setSubmitting(false); }
  };
  return <div className="grid gap-3"><TextArea aria-label="Nội dung bài viết" rows={5} maxLength={5000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Bạn muốn chia sẻ điều gì về cầu lông?" /><ImageUploadPicker key={pickerVersion} label="Thêm ảnh bài viết" authorize={authorizeCommunityPostImage} upload={uploadAuthorizedFile} onUploadedChange={setImages} />{error && <p role="alert" className="text-sm text-danger">{error}</p>}<div className="flex items-center justify-between gap-3"><p className="text-caption">{body.length.toLocaleString('vi-VN')} / 5.000 ký tự{pending ? ' · đang tải ảnh' : failed ? ' · có ảnh cần thử lại hoặc gỡ' : ''}</p><Button disabled={submitting || !body.trim() || pending || failed} onClick={() => void publish()}>{submitting ? 'Đang đăng…' : 'Đăng bài'}</Button></div></div>;
}
