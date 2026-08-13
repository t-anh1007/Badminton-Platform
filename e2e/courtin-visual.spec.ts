import { expect, test } from '@playwright/test';

const viewports = [{ name: 'desktop', width: 1440, height: 1024 }, { name: 'mobile', width: 390, height: 844 }] as const;
const routes = ['/', '/venues', '/matches', '/passport', '/community', '/assistant', '/profile', '/admin'] as const;

for (const viewport of viewports) {
  test.describe(`COURTIN visual shell — ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });
    for (const route of routes) {
      test(`${route} exposes COURTIN chrome and a stable main landmark`, async ({ page }) => {
        if (route === '/matches') {
          await page.route('**/matches**', async (request) => {
            if (request.request().resourceType() === 'fetch') {
              await request.fulfill({ json: { matches: [] } });
              return;
            }
            await request.continue();
          });
        }
        if (route === '/venues') {
          await page.route('**/search**', async (request) => {
            if (request.request().resourceType() === 'fetch') {
              await request.fulfill({ json: [] });
              return;
            }
            await request.continue();
          });
        }
        if (route === '/community') {
          await page.route('**/posts**', async (request) => {
            if (request.request().resourceType() === 'fetch') {
              await request.fulfill({ json: { posts: [] } });
              return;
            }
            await request.continue();
          });
        }
        await page.goto(route);
        await expect(page.locator('#main-content')).toBeVisible();
        await expect(page.getByRole('link', { name: /COURTIN.*trang chủ/i })).toBeVisible();
        await expect(page).toHaveScreenshot(`courtin-${viewport.name}-${route === '/' ? 'home' : route.slice(1)}.png`, { fullPage: true });
      });
    }
  });
}
