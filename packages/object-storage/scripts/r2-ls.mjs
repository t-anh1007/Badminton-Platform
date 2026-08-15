// Liệt kê object trong bucket R2 qua S3 API (wrangler không hỗ trợ `object list`).
// Đọc cấu hình từ biến môi trường OBJECT_STORAGE_* (nạp qua dotenv).
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const {
  OBJECT_STORAGE_ENDPOINT: endpoint,
  OBJECT_STORAGE_BUCKET: Bucket,
  OBJECT_STORAGE_ACCESS_KEY: accessKeyId,
  OBJECT_STORAGE_SECRET_KEY: secretAccessKey,
} = process.env;

if (!endpoint || !Bucket || !accessKeyId || !secretAccessKey) {
  console.error('Thiếu biến OBJECT_STORAGE_* (kiểm tra .env).');
  process.exit(1);
}

const s3 = new S3Client({ endpoint, region: 'auto', forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
const prefix = process.argv[2];
const res = await s3.send(new ListObjectsV2Command({ Bucket, Prefix: prefix }));
const objects = res.Contents ?? [];
console.log(`count=${objects.length}${prefix ? ` (prefix=${prefix})` : ''}`);
for (const o of objects) console.log(o.LastModified?.toISOString(), String(o.Size).padStart(8), o.Key);
