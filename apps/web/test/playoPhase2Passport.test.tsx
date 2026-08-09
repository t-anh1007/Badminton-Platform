import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { PassportPage } from '../src/pages/PassportPage';

describe('P2-FE2 — Player Passport', () => {
  it('renders the owner rating, uncertainty and declaration shell', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <PassportPage />
      </MemoryRouter>,
    );
    expect(html).toContain('Player Passport');
    expect(html).toContain('Đang xác định trình độ');
    expect(html).toContain('Khai báo trình độ');
    const source = readFileSync(new URL('../src/pages/PassportPage.tsx', import.meta.url), 'utf8');
    expect(source).toContain('evaluationCandidates');
    expect(source).toContain('submitMatchEvaluation');
  });
});
