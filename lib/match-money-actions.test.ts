import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const session = vi.hoisted(() => ({ current: { user: { role: 'admin' } } as unknown }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('./session', () => ({ getSession: async () => session.current }));
vi.mock('./cache', () => ({ updateSyncedData: vi.fn() }));
vi.mock('./match-money', () => {
  class MatchMoneyError extends Error {
    constructor(message: string, readonly code: string = 'unknown') {
      super(message);
      this.name = 'MatchMoneyError';
    }
  }
  return {
    MatchMoneyError,
    applyMatchMoneyUpdates: vi.fn(),
  };
});

const { revalidatePath } = await import('next/cache');
const { updateSyncedData } = await import('./cache');
const { applyMatchMoneyUpdates, MatchMoneyError } = await import('./match-money');
const { applyMatchMoney } = await import('./match-money-actions');

const updates = { players: [{ userId: 'u1', isPaid: true }] };

beforeEach(() => {
  session.current = { user: { role: 'admin' } };
  vi.mocked(applyMatchMoneyUpdates).mockReset();
  vi.mocked(updateSyncedData).mockClear();
  vi.mocked(revalidatePath).mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('applyMatchMoney', () => {
  it('returns unauthorized for a non-admin without touching the money', async () => {
    session.current = { user: { role: 'player' } };

    expect(await applyMatchMoney(44568, updates)).toEqual({ success: false, error: 'unauthorized' });
    expect(applyMatchMoneyUpdates).not.toHaveBeenCalled();
    expect(updateSyncedData).not.toHaveBeenCalled();
  });

  it('returns unauthorized without a session', async () => {
    session.current = null;

    expect(await applyMatchMoney(44568, updates)).toEqual({ success: false, error: 'unauthorized' });
    expect(applyMatchMoneyUpdates).not.toHaveBeenCalled();
  });

  it('passes the payload through verbatim and invalidates every page showing the money', async () => {
    expect(await applyMatchMoney(44568, updates)).toEqual({ success: true });

    expect(applyMatchMoneyUpdates).toHaveBeenCalledTimes(1);
    expect(applyMatchMoneyUpdates).toHaveBeenCalledWith(44568, updates);
    expect(updateSyncedData).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith('/[lang]/admin/money', 'page');
    expect(revalidatePath).toHaveBeenCalledWith('/[lang]/admin/money/[matchId]', 'page');
    expect(revalidatePath).toHaveBeenCalledWith('/[lang]/player/[id]', 'page');
  });

  it.each([
    ['noBonus'],
    ['notFound'],
    ['invalid'],
  ] as const)('maps a %s guard failure to its code', async (code) => {
    vi.mocked(applyMatchMoneyUpdates).mockRejectedValueOnce(new MatchMoneyError('guard', code));

    expect(await applyMatchMoney(44568, updates)).toEqual({ success: false, error: code });
    expect(updateSyncedData).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('reports unknown for an unexpected error instead of throwing', async () => {
    vi.mocked(applyMatchMoneyUpdates).mockRejectedValueOnce(new Error('connection lost'));

    expect(await applyMatchMoney(44568, updates)).toEqual({ success: false, error: 'unknown' });
    expect(updateSyncedData).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
