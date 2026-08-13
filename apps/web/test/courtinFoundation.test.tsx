import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('COURTIN design-system source contract', () => {
  it('declares the Figma-derived visual tokens and bundled font families', () => {
    const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
    for (const token of ['--color-brand-navy: #15446c', '--color-brand-yellow: #f5e663', '--font-display: "Archivo"', '--font-mono: "Geist Mono"']) expect(css).toContain(token);
    expect(css).toContain('@fontsource/archivo/vietnamese-800.css');
    expect(css).toContain('prefers-reduced-motion');
  });

  it('does not leave expiring Figma asset URLs in the runtime source', () => {
    const sources = ['../src/pages/HomePage.tsx', '../src/pages/VenueListPage.tsx', '../src/pages/CommunityPage.tsx'].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');
    expect(sources).not.toContain('figma.com/api/mcp');
  });
});
