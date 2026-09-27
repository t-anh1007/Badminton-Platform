import { describe, expect, it, vi } from 'vitest';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { S3Client } from '@aws-sdk/client-s3';
import { ObjectStorageError, PRESIGN_EXPIRY_SECONDS, S3ObjectStorageClient, buildOwnedObjectKey } from '../src/index.js';

vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn() }));

const ownerUserId = 'f42b3bc3-3b5a-43a0-b8e1-6d9f1395d7d9';
const otherUserId = '0b8e6c4e-6f7e-4c2a-9a55-1f7d2b8c9e01';
const checksum = 'Ah844++PI0ksuJOFlKyf3x0VPyxdYS4gLz2z/vVQCsg=';
const FIVE_MB = 5 * 1024 * 1024;

const privateClient = (send = vi.fn()) => new S3ObjectStorageClient({
  bucket: 'private-evidence', s3: { send } as unknown as S3Client, privateBucket: true,
});
const evidenceKey = `match/results/${ownerUserId}/proof.jpg`;
const inspectInput = { objectKey: evidenceKey, namespace: 'match/results' as const, ownerUserId, mimeType: 'image/jpeg', maxBytes: FIVE_MB };

describe('private evidence storage', () => {
  it('keys result evidence and reward proof inside their owner namespaces', () => {
    expect(buildOwnedObjectKey({ namespace: 'match/results', ownerUserId, mimeType: 'image/jpeg', nonce: 'a' }))
      .toBe(`match/results/${ownerUserId}/a.jpg`);
    expect(buildOwnedObjectKey({ namespace: 'finance/rewards', ownerUserId, mimeType: 'image/png', nonce: 'b' }))
      .toBe(`finance/rewards/${ownerUserId}/b.png`);
  });

  it('refuses a private bucket configured with a public base URL', () => {
    expect(() => new S3ObjectStorageClient({
      bucket: 'x', s3: {} as S3Client, privateBucket: true, publicBaseUrl: 'https://cdn.test',
    })).toThrow(ObjectStorageError);
  });

  it('keeps private namespaces off the public bucket and public namespaces off the private bucket', async () => {
    const publicClient = new S3ObjectStorageClient({ bucket: 'media', s3: { send: vi.fn() } as unknown as S3Client });
    await expect(publicClient.authorizeUpload({ namespace: 'match/results', ownerUserId, mimeType: 'image/jpeg', checksumSha256: checksum }))
      .rejects.toMatchObject({ code: 'OBJECT_NAMESPACE_FORBIDDEN' });
    await expect(privateClient().authorizeUpload({ namespace: 'community/posts', ownerUserId, mimeType: 'image/jpeg', checksumSha256: checksum }))
      .rejects.toMatchObject({ code: 'OBJECT_NAMESPACE_FORBIDDEN' });
  });

  it('requires a valid base64 SHA-256 before signing a private upload', async () => {
    await expect(privateClient().authorizeUpload({ namespace: 'match/results', ownerUserId, mimeType: 'image/jpeg' }))
      .rejects.toMatchObject({ code: 'OBJECT_CHECKSUM_REQUIRED' });
    await expect(privateClient().authorizeUpload({ namespace: 'match/results', ownerUserId, mimeType: 'image/jpeg', checksumSha256: 'abc' }))
      .rejects.toMatchObject({ code: 'OBJECT_CHECKSUM_INVALID' });
  });

  it('signs the checksum header so storage rejects a body with another digest', async () => {
    vi.mocked(getSignedUrl).mockResolvedValue('https://storage.test/put');
    const upload = await privateClient().authorizeUpload({ namespace: 'match/results', ownerUserId, mimeType: 'image/jpeg', checksumSha256: checksum });

    expect(upload.headers).toEqual({ 'Content-Type': 'image/jpeg', 'x-amz-checksum-sha256': checksum });
    const [, command, options] = vi.mocked(getSignedUrl).mock.calls.at(-1)!;
    expect((command as { input: { ChecksumSHA256?: string } }).input.ChecksumSHA256).toBe(checksum);
    expect(options).toMatchObject({ expiresIn: PRESIGN_EXPIRY_SECONDS, unhoistableHeaders: new Set(['x-amz-checksum-sha256']) });
  });

  it('always returns signed reads from the private bucket', async () => {
    vi.mocked(getSignedUrl).mockResolvedValue('https://storage.test/private-read');
    await expect(privateClient().getReadUrl(evidenceKey)).resolves.toBe('https://storage.test/private-read');
  });

  it('rejects wrong owner or namespace before any HEAD request', async () => {
    const send = vi.fn();
    await expect(privateClient(send).inspectOwnedObject({ ...inspectInput, ownerUserId: otherUserId })).rejects.toMatchObject({ code: 'OBJECT_NOT_OWNED' });
    await expect(privateClient(send).inspectOwnedObject({ ...inspectInput, namespace: 'finance/rewards' })).rejects.toMatchObject({ code: 'OBJECT_NOT_OWNED' });
    expect(send).not.toHaveBeenCalled();
  });

  it('accepts exactly 5 MB and rejects 5 MB + 1 byte', async () => {
    const at = (ContentLength: number) => privateClient(vi.fn().mockResolvedValue({ ContentType: 'image/jpeg', ContentLength, ChecksumSHA256: checksum }));
    await expect(at(FIVE_MB).inspectOwnedObject(inspectInput)).resolves.toEqual({ size: FIVE_MB, checksumSha256: checksum });
    await expect(at(FIVE_MB + 1).inspectOwnedObject(inspectInput)).rejects.toMatchObject({ code: 'OBJECT_TOO_LARGE' });
  });

  it('rejects a committed object whose stored checksum differs from the declared one', async () => {
    const send = vi.fn().mockResolvedValue({ ContentType: 'image/jpeg', ContentLength: 1024, ChecksumSHA256: checksum });
    await expect(privateClient(send).inspectOwnedObject({ ...inspectInput, expectedChecksumSha256: 'B'.repeat(43) + '=' }))
      .rejects.toMatchObject({ code: 'OBJECT_CHECKSUM_MISMATCH' });
    expect((send.mock.calls[0][0] as { input: { ChecksumMode?: string } }).input.ChecksumMode).toBe('ENABLED');
  });
});
