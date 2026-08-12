import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { triggerSync } from '@/lib/actions';
import { useSyncData } from '@/lib/hooks/useSyncData';

vi.mock('@/lib/actions', () => ({ triggerSync: vi.fn() }));

beforeEach(() => {
  vi.mocked(triggerSync).mockReset();
  vi.mocked(triggerSync).mockResolvedValue({ success: true });
});

describe('useSyncData', () => {
  it('asks for confirmation instead of syncing on the first click', () => {
    const { result } = renderHook(() => useSyncData());

    act(() => result.current.requestSync());

    expect(result.current.isConfirmOpen).toBe(true);
    expect(triggerSync).not.toHaveBeenCalled();
  });

  it('runs the sync and closes the dialog on confirmation', async () => {
    const { result } = renderHook(() => useSyncData());

    act(() => result.current.requestSync());
    await act(async () => { await result.current.confirmSync(); });

    expect(triggerSync).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.isConfirmOpen).toBe(false));
    expect(result.current.isSyncing).toBe(false);
  });

  it('clears the running flag even when the sync throws', async () => {
    vi.mocked(triggerSync).mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useSyncData());

    act(() => result.current.requestSync());
    await act(async () => { await result.current.confirmSync(); });

    expect(result.current.isSyncing).toBe(false);
    expect(result.current.isConfirmOpen).toBe(false);
  });

  it('reports a failed sync without leaving the dialog open', async () => {
    vi.mocked(triggerSync).mockResolvedValue({ success: false, error: 'locked' });
    const { result } = renderHook(() => useSyncData());

    act(() => result.current.requestSync());
    await act(async () => { await result.current.confirmSync(); });

    expect(result.current.isConfirmOpen).toBe(false);
  });
});
