import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ShutdownStatusBanner } from './ManageVenueDetailPage.js';
import type { OperationalShutdownStatus } from '../../lib/venueBookingApi.js';

function status(overrides: Partial<OperationalShutdownStatus> = {}): OperationalShutdownStatus {
  return {
    id: 'shutdown-1',
    mode: 'winding_down',
    operationalStatus: 'winding_down',
    resolutionStatus: 'not_required',
    effectiveAt: null,
    expectedInactiveAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    counts: {},
    ...overrides,
  };
}

afterEach(cleanup);

describe('shutdown status banner', () => {
  it('does not show a stale service deadline after holds expire and the court closes early', () => {
    render(<ShutdownStatusBanner status={status({ operationalStatus: 'inactive' })} />);

    expect(screen.getByRole('status').textContent).not.toContain('vẫn được phục vụ đến');
    expect(screen.getByRole('status').textContent).toContain('Đã ngừng hoạt động');
    expect(screen.getByRole('status').textContent).toContain('Các lịch đã nhận đã kết thúc.');
  });

  it('shows the expected last service time while the court is still winding down', () => {
    render(<ShutdownStatusBanner status={status()} />);

    expect(screen.getByRole('status').textContent).toContain('vẫn được phục vụ đến');
  });
});
