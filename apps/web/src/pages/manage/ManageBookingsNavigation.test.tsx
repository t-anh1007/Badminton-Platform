import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ManageLayout } from '../../manage/ManageLayout.js';
import { resolveNotificationRoute } from '../../notifications/notificationRoutes.js';
import { ManageOverviewPage } from './ManageOverviewPage.js';

afterEach(cleanup);

describe('provider booking navigation', () => {
  it('places Quản lý booking after Lịch in the provider sidebar', () => {
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
      '📊Tổng quan',
      '🏸Sân',
      '📅Lịch',
      '📋Quản lý booking',
      '⚠️Sự cố',
      '🏆Hồ sơ kèo',
      '💰Tài chính',
    ]);
    expect(screen.getByRole('link', { name: /Quản lý booking/ })).toHaveAttribute('href', '/manage/bookings');
  });

  it('shows the dashboard shortcut and maps provider booking notifications to the drawer', () => {
    render(
      <MemoryRouter>
        <ManageOverviewPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Quản lý booking/ })).toHaveAttribute('href', '/manage/bookings');
    expect(resolveNotificationRoute({
      actionKind: 'booking.view',
      entityId: '11111111-1111-4111-8111-111111111111',
      targetRole: 'provider',
    }, 'provider')).toBe('/manage/bookings?booking=11111111-1111-4111-8111-111111111111');
  });
});
