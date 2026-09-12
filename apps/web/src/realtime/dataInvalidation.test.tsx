import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { publishDataInvalidation, useLiveDataRefresh } from './dataInvalidation.js';

describe('live data invalidation', () => {
  it('refetches the mounted page after a successful mutation signal', async () => {
    const refresh = vi.fn();
    renderHook(() => useLiveDataRefresh(refresh, 0));

    act(() => publishDataInvalidation());

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });
});
