import { describe, expect, it, vi } from 'vitest';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { S3Client } from '@aws-sdk/client-s3';
import {
  ObjectStorageError,
  buildOwnedObjectKey,
  validateUploadInput,
  PRESIGN_EXPIRY_SECONDS,
  S3ObjectStorageClient,
} from '../src/index.js';

vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn() }));

const ownerUserId = 'f42b3bc3-3b5a-43a0-b8e1-6d9f1395d7d9';

describe('object-storage upload boundary', () => {
  it('creates a key only inside the requested namespace and owner prefix', () => {
    const key = buildOwnedObjectKey({
      namespace: 'community/posts',
      ownerUserId,
      mimeType: 'image/webp',
      nonce: 'fixed-token',
    });

    expect(key).toBe(`community/posts/${ownerUserId}/fixed-token.webp`);
  });

  it.each([
    ['community/posts/../other/file.jpg', 'community/posts'],
    ['community/posts/another-user/file.jpg', 'community/posts'],
    [`venue/images/${ownerUserId}/file.jpg`, 'community/posts'],
  ])('rejects traversal and namespace or user mismatches: %s', (objectKey, namespace) => {
    expect(() => validateUploadInput({
      objectKey,
      namespace,
      ownerUserId,
      mimeType: 'image/jpeg',
      maxBytes: 8 * 1024 * 1024,
    })).toThrow(ObjectStorageError);
  });

  it.each(['image/gif', 'application/octet-stream'])('rejects unsupported MIME type %s', (mimeType) => {
    expect(() => validateUploadInput({
      objectKey: `venue/images/${ownerUserId}/photo.jpg`,
      namespace: 'venue/images',
      ownerUserId,
      mimeType,
      maxBytes: 8 * 1024 * 1024,
    })).toThrow(/JPEG, PNG hoặc WebP/);
  });

  it('rejects a configured maximum above 8 MiB', () => {
    expect(() => validateUploadInput({
      objectKey: `venue/images/${ownerUserId}/photo.jpg`,
      namespace: 'venue/images',
      ownerUserId,
      mimeType: 'image/jpeg',
      maxBytes: 8 * 1024 * 1024 + 1,
    })).toThrow(/8 MiB/);
  });

  it('uses 10-minute presigns and a deterministic public read URL', async () => {
    const signedUrl = vi.mocked(getSignedUrl).mockResolvedValue('https://storage.test/signed');
    const storage = new S3ObjectStorageClient({
      bucket: 'media',
      s3: { send: vi.fn() } as unknown as S3Client,
      publicBaseUrl: 'https://cdn.example.test/media/',
      now: () => new Date('2026-08-14T00:00:00.000Z'),
    });

    const upload = await storage.authorizeUpload({ namespace: 'venue/images', ownerUserId, mimeType: 'image/png' });

    expect(upload.uploadUrl).toBe('https://storage.test/signed');
    expect(upload.expiresAt).toBe('2026-08-14T00:10:00.000Z');
    expect(signedUrl).toHaveBeenCalledWith(expect.anything(), expect.anything(), { expiresIn: PRESIGN_EXPIRY_SECONDS });
    await expect(storage.getReadUrl(`venue/images/${ownerUserId}/photo.png`))
      .resolves.toBe(`https://cdn.example.test/media/venue/images/${ownerUserId}/photo.png`);
  });

  it('HEAD-verifies MIME, size, and owned prefix before metadata can attach', async () => {
    const send = vi.fn().mockResolvedValue({ ContentType: 'image/jpeg', ContentLength: 1024 });
    const storage = new S3ObjectStorageClient({ bucket: 'media', s3: { send } as unknown as S3Client });

    await expect(storage.assertOwnedObject({
      objectKey: `community/posts/${ownerUserId}/photo.jpg`,
      namespace: 'community/posts', ownerUserId, mimeType: 'image/jpeg', maxBytes: 8 * 1024 * 1024,
    })).resolves.toBeUndefined();
    await expect(storage.assertOwnedObject({
      objectKey: `community/posts/${ownerUserId}/photo.png`,
      namespace: 'community/posts', ownerUserId, mimeType: 'image/png', maxBytes: 8 * 1024 * 1024,
    })).rejects.toThrow(/khớp/);
  });
});
