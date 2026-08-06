import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProfilePage } from '../src/pages/ProfilePage';
import { AdminPage } from '../src/pages/AdminPage';

describe('UI G6 — doanh thu, rút tiền và đối soát', () => {
  it('provider thấy ba phân vùng, lịch doanh thu và form rút tiền', () => {
    const html = renderToStaticMarkup(<ProfilePage />);
    expect(html).toContain('Doanh thu và rút tiền');
    expect(html).toContain('Đang chờ 24 giờ');
    expect(html).toContain('Tạo yêu cầu rút');
  });

  it('Admin có khu vực yêu cầu rút và hàng chờ đối soát', () => {
    const html = renderToStaticMarkup(<AdminPage />);
    expect(html).toContain('Yêu cầu rút tiền');
    expect(html).toContain('Đối soát');
  });
});
