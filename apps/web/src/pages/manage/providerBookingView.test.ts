import { describe, expect, it } from 'vitest';
import {
  providerBookingBadgeTone,
  providerBookingStatusLabel,
  readProviderBookingFilters,
  writeProviderBookingFilters,
} from './providerBookingView.js';

describe('provider booking view state', () => {
  it('parses safe URL defaults and keeps supported filters', () => {
    const parsed = readProviderBookingFilters(
      new URLSearchParams('timeScope=future&page=3&status=confirmed&venueId=v1&junk=x'),
    );

    expect(parsed).toEqual({
      query: '',
      venueId: 'v1',
      courtId: '',
      status: 'confirmed',
      timeScope: 'future',
      from: '',
      to: '',
      page: 3,
      pageSize: 20,
    });
  });

  it('drops empty and default values when serializing filters', () => {
    const query = writeProviderBookingFilters({
      query: '',
      venueId: '',
      courtId: '',
      status: '',
      timeScope: 'all',
      from: '',
      to: '',
      page: 1,
      pageSize: 20,
    });

    expect(query.toString()).toBe('');
  });

  it('maps every status to visible copy and a non-color-only badge tone', () => {
    expect(providerBookingStatusLabel('held', true)).toBe('Đã đặt cọc');
    expect(providerBookingStatusLabel('confirmed', false)).toBe('Đã xác nhận');
    expect(providerBookingBadgeTone('cancelled')).toBe('danger');
  });
});
