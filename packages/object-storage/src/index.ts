import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const PRESIGN_EXPIRY_SECONDS = 10 * 60;
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];
export type ObjectNamespace = 'community/posts' | 'venue/images';

export class ObjectStorageError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export interface AuthorizeUploadInput {
  namespace: ObjectNamespace;
  ownerUserId: string;
  mimeType: ImageMimeType;
}

export interface AssertOwnedObjectInput {
  objectKey: string;
  namespace: ObjectNamespace;
  ownerUserId: string;
  mimeType: string;
  maxBytes: number;
}

export interface ObjectStorageClient {
  authorizeUpload(input: AuthorizeUploadInput): Promise<{
    objectKey: string;
    uploadUrl: string;
    headers: Record<string, string>;
    expiresAt: string;
  }>;
  assertOwnedObject(input: AssertOwnedObjectInput): Promise<void>;
  getReadUrl(objectKey: string): Promise<string>;
  deleteObject(objectKey: string): Promise<void>;
}

const extensions: Record<ImageMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function assertOwnerId(ownerUserId: string): void {
  if (!/^[0-9a-f-]{36}$/i.test(ownerUserId)) {
    throw new ObjectStorageError('OBJECT_OWNER_INVALID', 'Định danh chủ sở hữu không hợp lệ.');
  }
}

function assertImageMimeType(mimeType: string): asserts mimeType is ImageMimeType {
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new ObjectStorageError('OBJECT_MIME_UNSUPPORTED', 'Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.');
  }
}

function expectedPrefix(namespace: ObjectNamespace, ownerUserId: string): string {
  return `${namespace}/${ownerUserId}/`;
}

export function buildOwnedObjectKey(input: AuthorizeUploadInput & { nonce?: string }): string {
  assertOwnerId(input.ownerUserId);
  assertImageMimeType(input.mimeType);
  const nonce = input.nonce ?? randomUUID();
  if (!/^[a-zA-Z0-9_-]+$/.test(nonce)) {
    throw new ObjectStorageError('OBJECT_KEY_INVALID', 'Tên đối tượng tải lên không hợp lệ.');
  }
  return `${expectedPrefix(input.namespace, input.ownerUserId)}${nonce}.${extensions[input.mimeType]}`;
}

/** Validates the object namespace before any S3 HEAD or metadata transaction. */
export function validateUploadInput(input: AssertOwnedObjectInput): void {
  assertOwnerId(input.ownerUserId);
  assertImageMimeType(input.mimeType);
  if (!Number.isInteger(input.maxBytes) || input.maxBytes < 1 || input.maxBytes > MAX_IMAGE_BYTES) {
    throw new ObjectStorageError('OBJECT_MAX_BYTES_INVALID', 'Dung lượng ảnh tối đa là 8 MiB.');
  }
  if (input.objectKey.includes('..') || input.objectKey.includes('\\') || !input.objectKey.startsWith(expectedPrefix(input.namespace, input.ownerUserId))) {
    throw new ObjectStorageError('OBJECT_NOT_OWNED', 'Tệp tải lên không thuộc phạm vi của bạn.');
  }
  const suffix = `.${extensions[input.mimeType]}`;
  if (!input.objectKey.endsWith(suffix) || !/^[a-zA-Z0-9/_-]+\.(jpg|png|webp)$/.test(input.objectKey)) {
    throw new ObjectStorageError('OBJECT_KEY_INVALID', 'Khóa đối tượng ảnh không hợp lệ.');
  }
}

export interface S3ObjectStorageOptions {
  bucket: string;
  s3: S3Client;
  publicBaseUrl?: string;
  now?: () => Date;
}

export class S3ObjectStorageClient implements ObjectStorageClient {
  private readonly now: () => Date;

  constructor(private readonly options: S3ObjectStorageOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async authorizeUpload(input: AuthorizeUploadInput) {
    const objectKey = buildOwnedObjectKey(input);
    const uploadUrl = await getSignedUrl(
      this.options.s3,
      new PutObjectCommand({ Bucket: this.options.bucket, Key: objectKey, ContentType: input.mimeType }),
      { expiresIn: PRESIGN_EXPIRY_SECONDS },
    );
    return {
      objectKey,
      uploadUrl,
      headers: { 'Content-Type': input.mimeType },
      expiresAt: new Date(this.now().getTime() + PRESIGN_EXPIRY_SECONDS * 1_000).toISOString(),
    };
  }

  async assertOwnedObject(input: AssertOwnedObjectInput): Promise<void> {
    validateUploadInput(input);
    let head: { ContentType?: string; ContentLength?: number };
    try {
      head = await this.options.s3.send(new HeadObjectCommand({ Bucket: this.options.bucket, Key: input.objectKey }));
    } catch {
      throw new ObjectStorageError('OBJECT_NOT_FOUND', 'Không tìm thấy ảnh đã tải lên.');
    }
    const contentType = head.ContentType?.split(';', 1)[0];
    if (contentType !== input.mimeType) {
      throw new ObjectStorageError('OBJECT_MIME_MISMATCH', 'Loại ảnh tải lên không khớp.');
    }
    if (typeof head.ContentLength !== 'number' || head.ContentLength < 1 || head.ContentLength > input.maxBytes) {
      throw new ObjectStorageError('OBJECT_TOO_LARGE', 'Ảnh vượt quá dung lượng cho phép.');
    }
  }

  async getReadUrl(objectKey: string): Promise<string> {
    if (this.options.publicBaseUrl) return `${this.options.publicBaseUrl.replace(/\/$/, '')}/${encodeURI(objectKey)}`;
    return getSignedUrl(
      this.options.s3,
      new GetObjectCommand({ Bucket: this.options.bucket, Key: objectKey }),
      { expiresIn: PRESIGN_EXPIRY_SECONDS },
    );
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.options.s3.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: objectKey }));
  }
}

export function createObjectStorageClientFromEnv(environment = process.env): ObjectStorageClient {
  const bucket = environment.OBJECT_STORAGE_BUCKET;
  const endpoint = environment.OBJECT_STORAGE_ENDPOINT;
  const accessKeyId = environment.OBJECT_STORAGE_ACCESS_KEY;
  const secretAccessKey = environment.OBJECT_STORAGE_SECRET_KEY;
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
    throw new ObjectStorageError('OBJECT_STORAGE_UNCONFIGURED', 'Chưa cấu hình kho lưu trữ ảnh.');
  }
  const config: S3ClientConfig = {
    endpoint,
    region: environment.OBJECT_STORAGE_REGION ?? 'us-east-1',
    forcePathStyle: environment.OBJECT_STORAGE_FORCE_PATH_STYLE !== 'false',
    credentials: { accessKeyId, secretAccessKey },
  };
  return new S3ObjectStorageClient({
    bucket,
    s3: new S3Client(config),
    publicBaseUrl: environment.OBJECT_STORAGE_PUBLIC_BASE_URL,
  });
}
