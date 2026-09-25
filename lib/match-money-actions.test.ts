import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const session = vi.hoisted(() => ({ current: { user: { role: 'admin' } } as unknown }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('./session', () => ({ getSession: async () => session.current }));
vi.mock('./cache', () => ({ updateSyncedData: vi.fn() }));
vi.mock('./push', () => ({ sendPersonalMoneyPushes: vi.fn() }));
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
const { sendPersonalMoneyPushes } = await import('./push');
const { applyMatchMoneyUpdates, MatchMoneyError } = await import('./match-money');
const { applyMatchMoney } = await import('./match-money-actions');

const updates = { players: [{ userId: 'u1', isPaid: true }] };
const personalPushes = [
  { userId: 'u1', event: 'finePaid' as const, params: { amount: 13, opponent: 'Trenčín' } },
];

function applied() {
  return {
    changes: [], recalculated: false, sheet: {}, personalPushes,
  } as unknown as Awaited<ReturnType<typeof applyMatchMoneyUpdates>>;
}

beforeEach(() => {
  session.current = { user: { role: 'admin' } };
  vi.mocked(applyMatchMoneyUpdates).mockReset();
  vi.mocked(applyMatchMoneyUpdates).mockResolvedValue(applied());
  vi.mocked(sendPersonalMoneyPushes).mockClear();
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
    expect(sendPersonalMoneyPushes).not.toHaveBeenCalled();
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

  it('delivers the settlement pushes the write worked out, after invalidating', async () => {
    expect(await applyMatchMoney(44568, updates)).toEqual({ success: true });

    expect(sendPersonalMoneyPushes).toHaveBeenCalledTimes(1);
    expect(sendPersonalMoneyPushes).toHaveBeenCalledWith(personalPushes);
    expect(vi.mocked(updateSyncedData).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(sendPersonalMoneyPushes).mock.invocationCallOrder[0]);
  });

  it('sends nothing when the write settled nobody', async () => {
    vi.mocked(applyMatchMoneyUpdates).mockResolvedValueOnce({ ...applied(), personalPushes: [] });

    expect(await applyMatchMoney(44568, updates)).toEqual({ success: true });
    expect(sendPersonalMoneyPushes).toHaveBeenCalledWith([]);
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
    expect(sendPersonalMoneyPushes).not.toHaveBeenCalled();
  });

  it('reports unknown for an unexpected error instead of throwing', async () => {
    vi.mocked(applyMatchMoneyUpdates).mockRejectedValueOnce(new Error('connection lost'));

    expect(await applyMatchMoney(44568, updates)).toEqual({ success: false, error: 'unknown' });
    expect(updateSyncedData).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
