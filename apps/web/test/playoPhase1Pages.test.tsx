import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AuthForm } from '../src/components/AuthForm';
import { BookingPage } from '../src/pages/BookingPage';
import { ProfilePage } from '../src/pages/ProfilePage';
import { AdminPage } from '../src/pages/AdminPage';

describe('P2-FE1 â€” Phase 1 Playo routes', () => {
  it('keeps the email verification and recovery paths actionable', () => {
    const html = renderToStaticMarkup(<MemoryRouter><AuthForm initialMode="verify" /></MemoryRouter>);
    expect(html).toContain('Xác minh email');
    expect(html).toContain('Gửi lại email xác minh');
  });

  it('renders the booking real-API journey shell only with a venue id', () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={['/booking?venueId=venue-1']}><BookingPage /></MemoryRouter>);
    expect(html).toContain('Chọn slot');
    expect(html).toContain('Tóm tắt đặt sân');
    expect(html).toContain('Đang tải');
  });

  it('keeps profile cancellation history and the four admin work areas in the page shells', () => {
    const profile = renderToStaticMarkup(<MemoryRouter initialEntries={['/profile']}><ProfilePage /></MemoryRouter>);
    const admin = renderToStaticMarkup(<MemoryRouter><AdminPage /></MemoryRouter>);
    expect(profile).toContain('Đã hủy');
    expect(profile).toContain('Booking của tôi');
    for (const label of ['Duyệt NCC', 'Rút tiền', 'Đối soát', 'Tranh chấp']) expect(admin).toContain(label);
  });
});
