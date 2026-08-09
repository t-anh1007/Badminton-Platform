import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ProfilePage } from '../src/pages/ProfilePage';

describe('UI G5 — hủy và điều chỉnh booking', () => {
  it('ProfilePage có khu vực booking của tôi và thao tác phía sân', () => {
    const html = renderToStaticMarkup(<MemoryRouter><ProfilePage /></MemoryRouter>);
    expect(html).toContain('Booking của tôi');
    expect(html).toContain('Quản lý sự cố phía sân');
    expect(html).toContain('hiển thị số tiền hoàn trước bước Xác nhận hủy');
  });
});
