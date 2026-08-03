#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const [sourceArg, pngFlag] = process.argv.slice(2);
if (!sourceArg) {
  console.error('Thiếu đường dẫn file .puml.');
  process.exit(2);
}

const source = path.resolve(sourceArg);
if (!fs.existsSync(source)) {
  console.error(`Không thấy file: ${sourceArg}`);
  process.exit(2);
}

function encode6bit(value) {
  if (value < 10) return String.fromCharCode(48 + value);
  value -= 10;
  if (value < 26) return String.fromCharCode(65 + value);
  value -= 26;
  if (value < 26) return String.fromCharCode(97 + value);
  return value === 26 ? '-' : '_';
}

function append3bytes(b1, b2, b3) {
  const c1 = b1 >> 2;
  const c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
  const c3 = ((b2 & 0xf) << 2) | (b3 >> 6);
  const c4 = b3 & 0x3f;
  return encode6bit(c1 & 0x3f) + encode6bit(c2 & 0x3f) + encode6bit(c3 & 0x3f) + encode6bit(c4 & 0x3f);
}

function plantUmlEncode(text) {
  const data = zlib.deflateRawSync(Buffer.from(text, 'utf8'), { level: 9 });
  let encoded = '';
  for (let i = 0; i < data.length; i += 3) {
    encoded += append3bytes(data[i], data[i + 1] || 0, data[i + 2] || 0);
  }
  return encoded;
}

async function download(format, destination, minimumBytes) {
  const encoded = plantUmlEncode(fs.readFileSync(source, 'utf8'));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`https://www.plantuml.com/plantuml/${format}/${encoded}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length < minimumBytes) throw new Error(`output quá nhỏ (${data.length} bytes)`);
    if (format === 'svg') {
      const body = data.toString('utf8');
      if (/Syntax Error|An error has occured|cannot find message/i.test(body)) {
        throw new Error('PlantUML trả về thông báo lỗi cú pháp');
      }
    }
    fs.writeFileSync(destination, data);
  } finally {
    clearTimeout(timer);
  }
}

const svg = source.replace(/\.puml$/i, '.svg');
try {
  await download('svg', svg, 200);
  console.log(`✅ SVG: ${svg} (qua plantuml.com; nội dung diagram được gửi ra internet)`);
} catch (error) {
  if (fs.existsSync(svg)) fs.rmSync(svg);
  console.error(`❌ Render PlantUML thất bại: ${error.message}`);
  process.exit(1);
}

if (pngFlag === '--png') {
  const png = source.replace(/\.puml$/i, '.png');
  try {
    await download('png', png, 500);
    console.log(`✅ PNG: ${png}`);
  } catch (error) {
    if (fs.existsSync(png)) fs.rmSync(png);
    console.warn(`⚠️  PNG render thất bại (${error.message}); SVG vẫn hợp lệ.`);
  }
}
