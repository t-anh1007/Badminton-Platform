import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vitest chạy với cwd = apps/web; đọc source theo path tuyệt đối từ đó để tránh
// `import.meta.url` bị Vite/jsdom trả về dưới dạng URL http (không phải file://).
const readSource = (relative: string) => readFileSync(resolve(process.cwd(), relative), 'utf8');

describe('COURTIN design-system source contract', () => {
  it('declares the Figma-derived visual tokens and bundled font families', () => {
    const css = readSource('src/index.css');
    for (const token of ['--color-brand-navy: #15446c', '--color-brand-yellow: #f5e663', '--font-display: "Archivo"', '--font-mono: "Geist Mono"']) expect(css).toContain(token);
    expect(css).toContain('@fontsource/archivo/vietnamese-800.css');
    expect(css).toContain('prefers-reduced-motion');
  });

  it('does not leave expiring Figma asset URLs in the runtime source', () => {
    const sources = ['src/pages/HomePage.tsx', 'src/pages/VenueListPage.tsx', 'src/pages/CommunityPage.tsx'].map(readSource).join('\n');
    expect(sources).not.toContain('figma.com/api/mcp');
  });
});
