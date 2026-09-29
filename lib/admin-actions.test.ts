import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const session = vi.hoisted(() => ({ current: { user: { role: 'admin' } } as unknown }));
const approvedRole = vi.hoisted(() => ({ current: 'player' as string | null }));
// Each db.batch() call takes the next entry, in the order the action runs its batches.
const batchResults = vi.hoisted(() => ({ queue: [] as unknown[][] }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('./session', () => ({ getSession: async () => session.current }));
vi.mock('./cache', () => ({ updateSyncedData: vi.fn() }));
vi.mock('./sync', () => ({ recalculateDerivedFinancials: vi.fn() }));
vi.mock('./activity-log', () => ({ logActivity: vi.fn() }));
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
    select: () => ({ from: () => ({ where: () => ({}) }) }),
    delete: () => ({ where: async () => undefined }),
    batch: async () => batchResults.queue.shift() ?? [],
  },
  sql: {},
}));

const { updateSyncedData } = await import('./cache');
const { recalculateDerivedFinancials } = await import('./sync');
const { logActivity } = await import('./activity-log');
const { approveUser, deleteUser, linkScrapedPlayer } = await import('./admin-actions');

const admin = { id: 'admin-1', name: 'Peter Admin', role: 'admin' };

beforeEach(() => {
  session.current = { user: admin };
  approvedRole.current = 'player';
  batchResults.queue = [];
  vi.mocked(recalculateDerivedFinancials).mockClear();
  vi.mocked(updateSyncedData).mockClear();
  vi.mocked(logActivity).mockClear();
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

describe('activity log', () => {
  const scrapedPlaceholder = { id: 's1', email: null, externalPlayerId: 4711 };
  const account = { id: 'a1', email: 'jan@example.com', externalPlayerId: null };

  it('records who approved which user', async () => {
    await approveUser('u1');
    expect(logActivity).toHaveBeenCalledExactlyOnceWith(
      'admin',
      'approveUser',
      { userId: 'u1', role: 'player' },
      admin,
    );
  });

  it('records a deletion', async () => {
    batchResults.queue = [[[{ count: 0 }], [{ count: 0 }]]];

    expect(await deleteUser('u2')).toEqual({ success: true });
    expect(logActivity).toHaveBeenCalledExactlyOnceWith('admin', 'deleteUser', { userId: 'u2' }, admin);
  });

  it('records a link with the external id that moved', async () => {
    batchResults.queue = [[[account], [scrapedPlaceholder]], []];

    expect(await linkScrapedPlayer('a1', 's1')).toEqual({ success: true });
    expect(logActivity).toHaveBeenCalledExactlyOnceWith(
      'admin',
      'linkScrapedPlayer',
      { accountId: 'a1', scrapedId: 's1', externalPlayerId: 4711 },
      admin,
    );
  });

  it('records nothing when the action is refused or fails', async () => {
    session.current = { user: { ...admin, role: 'player' } };
    await approveUser('u1');
    await deleteUser('u2');
    await linkScrapedPlayer('a1', 's1');

    session.current = { user: admin };
    approvedRole.current = null;
    await approveUser('gone');
    await deleteUser(admin.id);
    batchResults.queue = [[[{ count: 3 }], [{ count: 0 }]], [[account], [account]]];
    await deleteUser('u2');
    await linkScrapedPlayer('a1', 'a1');

    expect(logActivity).not.toHaveBeenCalled();
  });
});
