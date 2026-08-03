#!/usr/bin/env node
/*
 * mermaid-verify.mjs — compile-verify mọi block ```mermaid trong 1 file .md qua mmdc.
 *
 * Dùng bởi $sequence $activity $erd $state SAU khi Write — mermaid không render trong chat
 * (Mermaid syntax safety, diagram-selection.md), nên lỗi cú pháp trước đây chỉ lộ ra khi user
 * tự mở IDE/Obsidian/GitHub. Script này bắt lỗi NGAY, trước khi skill báo "xong".
 *
 * Dùng:
 *   node .agents/scripts/mermaid-verify.mjs --file docs/{feature}/srs/flows.md
 *   node .agents/scripts/mermaid-verify.mjs --file docs/x/srs/x-erd.md --png /tmp/erd-review
 *
 * Output: mỗi block PASS/FAIL kèm heading gần nhất (## ...) để biết lỗi ở đâu trong file.
 * Exit code = số block FAIL (0 nếu tất cả pass).
 *
 * --png <dir>: ngoài compile-check, giữ lại ảnh PNG mỗi block ở <dir>/block-N.png để skill
 * TỰ Read xem hình soi lỗi nghiệp vụ (thiếu entity, sai cardinality) — compile-check chỉ bắt
 * lỗi cú pháp, không bắt lỗi nội dung. In path từng ảnh ra stdout.
 *
 * mmdc cần PUPPETEER_EXECUTABLE_PATH trỏ Chrome sẵn có (~/.puppeteer-cache) — mmdc mặc định
 * tìm Chrome ở ~/.cache/puppeteer (không có gì ở đó trên môi trường này) và fail ngay nếu thiếu.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : null; };
const FILE = flag('file');
const PNG_DIR = flag('png');
if (!FILE) {
  console.error('Thiếu --file <path.md>. Ví dụ: --file docs/authentication/srs/flows.md');
  process.exit(2);
}
if (!fs.existsSync(FILE)) {
  console.error(`Không thấy file: ${FILE}`);
  process.exit(2);
}

function findChrome() {
  const configured = [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH];
  const platformCandidates = process.platform === 'win32'
    ? [
        path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ]
    : [
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      ];
  for (const candidate of [...configured, ...platformCandidates]) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }

  const cacheRoots = [path.join(os.homedir(), '.puppeteer-cache', 'chrome'), path.join(os.homedir(), '.cache', 'puppeteer')];
  for (const root of cacheRoots) {
    if (!fs.existsSync(root)) continue;
    const queue = [{ dir: root, depth: 0 }];
    while (queue.length) {
      const { dir, depth } = queue.shift();
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const candidate = path.join(dir, entry.name);
        if (entry.isFile() && ['chrome', 'chrome.exe', 'headless_shell', 'headless_shell.exe', 'Google Chrome for Testing'].includes(entry.name)) return candidate;
        if (entry.isDirectory() && depth < 5) queue.push({ dir: candidate, depth: depth + 1 });
      }
    }
  }
  return null;
}

const CHROME = findChrome();
if (!CHROME) {
  console.error('⚠️  Không tìm thấy Chrome/Chrome for Testing để chạy mmdc.');
  console.error('   Có thể đặt PUPPETEER_EXECUTABLE_PATH hoặc chạy: npx puppeteer browsers install chrome-headless-shell');
  process.exit(2);
}

// ---------- extract ```mermaid blocks + heading gần nhất ----------
function extractBlocks(mdPath) {
  const lines = fs.readFileSync(mdPath, 'utf8').split('\n');
  const blocks = [];
  let heading = '(no heading)';
  let inBlock = false;
  let buf = [];
  for (const line of lines) {
    if (/^##\s+/.test(line)) heading = line.replace(/^##\s+/, '').trim();
    if (line.trim() === '```mermaid') { inBlock = true; buf = []; continue; }
    if (inBlock && line.trim() === '```') { inBlock = false; blocks.push({ heading, code: buf.join('\n') }); continue; }
    if (inBlock) buf.push(line);
  }
  return blocks;
}

const blocks = extractBlocks(FILE);
if (!blocks.length) {
  console.log(`Không có block \`\`\`mermaid nào trong ${FILE} — không có gì để verify.`);
  process.exit(0);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mermaid-verify-'));
if (PNG_DIR) fs.mkdirSync(PNG_DIR, { recursive: true });
let failCount = 0;
const results = [];

blocks.forEach((b, i) => {
  const mmdPath = path.join(tmpDir, `block-${i}.mmd`);
  // --png → xuất PNG (Read tool xem được như ảnh) vào PNG_DIR; else SVG vào tmp (compile-check thôi).
  const outPath = PNG_DIR
    ? path.join(PNG_DIR, `block-${i}.png`)
    : path.join(tmpDir, `block-${i}.svg`);
  fs.writeFileSync(mmdPath, b.code);
  const mmdcCli = process.platform === 'win32'
    ? path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@mermaid-js', 'mermaid-cli', 'src', 'cli.js')
    : null;
  const mmdcCommand = mmdcCli && fs.existsSync(mmdcCli) ? process.execPath : 'mmdc';
  const mmdcArgs = mmdcCli && fs.existsSync(mmdcCli)
    ? [mmdcCli, '-i', mmdPath, '-o', outPath, '-s', '2']
    : ['-i', mmdPath, '-o', outPath, '-s', '2'];
  const res = spawnSync(mmdcCommand, mmdcArgs, {
    encoding: 'utf8',
    env: { ...process.env, PUPPETEER_EXECUTABLE_PATH: CHROME },
  });
  const ok = res.status === 0 && fs.existsSync(outPath);
  if (!ok) failCount++;
  results.push({ index: i, heading: b.heading, ok, pngPath: PNG_DIR && ok ? outPath : null, stderr: (res.stderr || '').split('\n').slice(0, 6).join('\n') });
});

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`\n=== mermaid-verify: ${FILE} (${blocks.length} block) ===`);
for (const r of results) {
  console.log(`${r.ok ? '✅' : '❌'} Block ${r.index + 1} — "${r.heading}"`);
  if (r.pngPath) console.log(`   🖼  ${r.pngPath}`);
  if (!r.ok) console.log(r.stderr.split('\n').map(l => '   ' + l).join('\n'));
}
console.log(`\n${blocks.length - failCount}/${blocks.length} block compile OK${failCount ? `, ${failCount} FAIL` : ''}`);
if (PNG_DIR && failCount === 0) console.log(`\n→ Ảnh PNG đã lưu ở ${PNG_DIR}. Read từng ảnh để tự soi thiếu entity/sai cardinality trước khi báo xong.`);
process.exit(failCount);
