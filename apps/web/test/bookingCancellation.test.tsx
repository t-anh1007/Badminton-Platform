import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BookingPage } from '../src/pages/BookingPage';

describe('UI G5 — hủy và điều chỉnh booking', () => {
  it('BookingPage có khu vực booking của tôi và thao tác phía sân', () => {
    const html = renderToStaticMarkup(<BookingPage />);
    expect(html).toContain('Booking của tôi');
    expect(html).toContain('Quản lý sự cố phía sân');
    expect(html).toContain('hiển thị số tiền hoàn trước bước Xác nhận hủy');
  });
});
