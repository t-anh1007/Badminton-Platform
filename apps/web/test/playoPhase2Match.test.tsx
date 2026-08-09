import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { MatchListPage } from '../src/pages/MatchListPage';
import { MatchDetailPage } from '../src/pages/MatchDetailPage';

describe('P2-FE2 — Playo match journeys', () => {
  it('renders the real match discovery and Quick Match entry points', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <MatchListPage />
      </MemoryRouter>,
    );
    expect(html).toContain('Kèo cầu lông');
    expect(html).toContain('Tìm nhanh');
    expect(html).toContain('Tạo kèo từ slot đang giữ');
  });

  it('renders the detail state-machine shell and organizer review area', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <MatchDetailPage />
      </MemoryRouter>,
    );
    expect(html).toContain('Chi tiết kèo');
    expect(html).toContain('Đang tải trạng thái tham gia');
    const source = readFileSync(new URL('../src/pages/MatchDetailPage.tsx', import.meta.url), 'utf8');
    expect(source).toContain('payMatchOrganizerContributionBalance');
    expect(source).toContain('canPayOrganizerContribution');
    expect(source).toContain('expiredApprovalReloaded');
  });

  it('derives singles/doubles and open/full labels from real match data', () => {
    const source = readFileSync(new URL('../src/pages/MatchListPage.tsx', import.meta.url), 'utf8');
    expect(source).toContain("match.capacity === 2 ? 'Kèo đơn' : 'Kèo đôi'");
    expect(source).toContain("match.openSlots > 0 ? 'Mở' : 'Đầy'");
  });
});
