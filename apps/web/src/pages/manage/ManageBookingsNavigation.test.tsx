import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ManageLayout } from '../../manage/ManageLayout.js';
import { resolveNotificationRoute } from '../../notifications/notificationRoutes.js';

afterEach(cleanup);

describe('provider booking navigation', () => {
  it('lists the four provider sections, Tài chính first', () => {
    render(
      <MemoryRouter initialEntries={['/manage']}>
        <Routes>
          <Route path="/manage" element={<ManageLayout />}>
            <Route index element={<p>Trang con</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const links = screen.getByRole('navigation', { name: 'Điều hướng quản trị' }).querySelectorAll('a');
    expect(Array.from(links).map((link) => link.textContent)).toEqual([
      'Tài chính',
      'Cơ sở',
      'Đặt sân',
      'Hồ sơ kèo',
    ]);
    expect(screen.getByRole('link', { name: /Đặt sân/ })).toHaveAttribute('href', '/manage/bookings');
  });

  it('maps provider booking notifications to the drawer', () => {
    expect(resolveNotificationRoute({
      actionKind: 'booking.view',
      entityId: '11111111-1111-4111-8111-111111111111',
      targetRole: 'provider',
    }, 'provider')).toBe('/manage/bookings?booking=11111111-1111-4111-8111-111111111111');
  });
});
