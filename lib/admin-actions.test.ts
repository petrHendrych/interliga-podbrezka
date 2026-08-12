import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const session = vi.hoisted(() => ({ current: { user: { role: 'admin' } } as unknown }));
const approvedRole = vi.hoisted(() => ({ current: 'player' as string | null }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('./session', () => ({ getSession: async () => session.current }));
vi.mock('./cache', () => ({ updateSyncedData: vi.fn() }));
vi.mock('./sync', () => ({ recalculateDerivedFinancials: vi.fn() }));
vi.mock('./db', () => ({
  db: {
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => (
            approvedRole.current === null ? [] : [{ role: approvedRole.current }]
          ),
        }),
      }),
    }),
  },
  sql: {},
}));

const { updateSyncedData } = await import('./cache');
const { recalculateDerivedFinancials } = await import('./sync');
const { approveUser } = await import('./admin-actions');

beforeEach(() => {
  session.current = { user: { role: 'admin' } };
  approvedRole.current = 'player';
  vi.mocked(recalculateDerivedFinancials).mockClear();
  vi.mocked(updateSyncedData).mockClear();
});

describe('approveUser', () => {
  it('recalculates when the approved account is a trainer', async () => {
    approvedRole.current = 'trainer';

    expect(await approveUser('u1')).toEqual({ success: true });
    // Trainer payments are fanned out over approved trainers only, so without this the
    // new trainer earns nothing for matches already played until the next sync.
    expect(recalculateDerivedFinancials).toHaveBeenCalledTimes(1);
  });

  it('skips the recalculation for a player, whose money does not depend on approval', async () => {
    approvedRole.current = 'player';

    expect(await approveUser('u1')).toEqual({ success: true });
    expect(recalculateDerivedFinancials).not.toHaveBeenCalled();
  });

  it('invalidates the cached bank numbers on every approval', async () => {
    await approveUser('u1');
    expect(updateSyncedData).toHaveBeenCalledTimes(1);
  });

  it('returns an error code instead of throwing for a non-admin', async () => {
    session.current = { user: { role: 'player' } };

    expect(await approveUser('u1')).toEqual({ success: false, error: 'unauthorized' });
    expect(recalculateDerivedFinancials).not.toHaveBeenCalled();
    expect(updateSyncedData).not.toHaveBeenCalled();
  });

  it('reports a missing user rather than claiming success', async () => {
    approvedRole.current = null;

    expect(await approveUser('gone')).toEqual({ success: false, error: 'notFound' });
    expect(updateSyncedData).not.toHaveBeenCalled();
  });
});
