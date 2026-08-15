import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdminPage } from '../src/pages/AdminPage';
import { FinanceAdminPanel } from '../src/components/FinanceAdminPanel';
import { FinancePanel } from '../src/components/FinancePanel';
import { MemoryRouter } from 'react-router-dom';

describe('UI G6 — doanh thu, rút tiền và đối soát', () => {
  it('provider thấy ba phân vùng, lịch doanh thu và form rút tiền', () => {
    const html = renderToStaticMarkup(<FinancePanel />);
    expect(html).toContain('Doanh thu và rút tiền');
    expect(html).toContain('Đang chờ 24 giờ');
    expect(html).toContain('Tạo yêu cầu rút');
  });

  it('Admin có khu vực yêu cầu rút và hàng chờ đối soát', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>,
    );
    const withdrawals = renderToStaticMarkup(<FinanceAdminPanel mode="withdrawals" />);
    const reconciliation = renderToStaticMarkup(<FinanceAdminPanel mode="reconciliation" />);
    expect(html).toContain('Rút tiền');
    expect(html).toContain('Đối soát');
    expect(withdrawals).toContain('Lý do xử lý tiền');
    expect(reconciliation).toContain('Hàng chờ đối soát');
  });
});
