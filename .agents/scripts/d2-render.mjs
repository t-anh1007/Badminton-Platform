#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const [sourceArg, pngFlag] = process.argv.slice(2);
if (!sourceArg) {
  console.error('Thiếu đường dẫn file .d2.');
  process.exit(2);
}

const source = path.resolve(sourceArg);
if (!fs.existsSync(source)) {
  console.error(`Không thấy file: ${sourceArg}`);
  process.exit(2);
}

const d2Command = process.env.D2_BIN || (process.platform === 'win32' ? 'd2.exe' : 'd2');
const svg = source.replace(/\.d2$/i, '.svg');
const compile = spawnSync(d2Command, ['--layout', 'elk', '--theme', '1', '--pad', '40', source, svg], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
if (compile.status !== 0 || !fs.existsSync(svg)) {
  console.error('❌ D2 compile thất bại. Cài D2 và bảo đảm lệnh d2 có trong PATH.');
  if (compile.stderr) console.error(compile.stderr.trim());
  process.exit(1);
}
console.log(`✅ SVG: ${svg}`);

if (pngFlag !== '--png') process.exit(0);

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  return candidates.find(candidate => candidate && fs.existsSync(candidate));
}

const chrome = findChrome();
if (!chrome) {
  console.warn('⚠️  Không tìm thấy Chrome để xuất PNG; SVG vẫn hợp lệ.');
  process.exit(0);
}

const svgText = fs.readFileSync(svg, 'utf8');
const viewBox = svgText.match(/viewBox="[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)"/i);
const width = viewBox ? Math.max(1, Math.round(Number(viewBox[1]))) : 1600;
const height = viewBox ? Math.max(1, Math.round(Number(viewBox[2]))) : 2200;
const png = source.replace(/\.d2$/i, '.png');
const screenshot = spawnSync(chrome, [
  '--headless',
  '--disable-gpu',
  `--screenshot=${png}`,
  `--window-size=${width},${height}`,
  '--default-background-color=FFFFFFFF',
  pathToFileURL(svg).href,
], { encoding: 'utf8' });
if (screenshot.status !== 0 || !fs.existsSync(png)) {
  console.warn('⚠️  Không xuất được PNG; SVG vẫn hợp lệ.');
  process.exit(0);
}
console.log(`✅ PNG: ${png} (${width}x${height})`);
