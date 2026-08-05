// Gdesign proof #3: chụp 5 page shell GĐ1 ở 2 viewport cố định (không dùng
// actl.me — site sống, hay thay đổi — làm bằng chứng duy nhất).
// Chạy: node scripts/gdesign-screenshots.mjs (cần apps/web dev server sẵn ở :5173)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:5173';
const OUT_DIR = 'docs/product/gdesign-screenshots';
const PAGES = [
  { path: '/', name: 'home' },
  { path: '/auth', name: 'auth' },
  { path: '/booking', name: 'booking' },
  { path: '/profile', name: 'profile' },
  { path: '/admin', name: 'admin' },
];
const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'mobile-390', width: 390, height: 844 },
];

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
let failed = 0;

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await context.newPage();
  for (const p of PAGES) {
    try {
      await page.goto(`${BASE}${p.path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400); // preloader fade-out
      const file = `${OUT_DIR}/${p.name}-${vp.name}.png`;
      await page.screenshot({ path: file, fullPage: true });
      console.log(`[OK] ${file}`);
    } catch (err) {
      failed++;
      console.error(`[ERR] ${p.name} @ ${vp.name}:`, err.message);
    }
  }
  await context.close();
}

await browser.close();
if (failed > 0) {
  console.error(`\n${failed} screenshot(s) FAILED`);
  process.exit(1);
}
console.log(`\nOK — ${PAGES.length * VIEWPORTS.length} screenshots saved to ${OUT_DIR}/`);
