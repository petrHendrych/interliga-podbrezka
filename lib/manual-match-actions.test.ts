import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { MANUAL_MATCH_ID_BASE, getManualLeagues } from './season-config';
import { matchSubstitutions } from './db/schema';
import {
  type ManualMatchInput,
  type ManualMatchPositionInput,
  POSITION_COUNT,
} from './validation/manual-match';

const session = vi.hoisted(() => ({ current: null as unknown }));
const existingMatches = vi.hoisted(() => ({ current: [] as { externalId: number }[] }));
const inserted = vi.hoisted(() => ({ current: [] as { table: unknown; values: unknown }[] }));
const writes = vi.hoisted(() => ({
  /** Statements awaited on their own instead of going through `db.batch`. */
  direct: 0,
  batches: [] as unknown[][],
  failBatch: false,
}));

// A write that is awaited directly runs `then`; one handed to `db.batch` never does.
const statement = vi.hoisted(() => () => ({
  then: (resolve: (value: undefined) => void) => {
    writes.direct += 1;
    resolve(undefined);
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('./session', () => ({ getSession: async () => session.current }));
vi.mock('./cache', () => ({ updateSyncedData: vi.fn() }));
vi.mock('./push', () => ({ sendPersonalMoneyPushes: vi.fn() }));
vi.mock('./sync', () => ({
  recalculateAndDiffPlayerMoney: vi.fn(async () => []),
  recalculateDerivedFinancials: vi.fn(),
}));
vi.mock('./activity-log', () => ({ logActivity: vi.fn() }));
vi.mock('./db', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => existingMatches.current }) }),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserted.current.push({ table, values });
        return { ...statement(), onConflictDoUpdate: statement };
      },
    }),
    delete: () => ({ where: statement }),
    batch: async (items: unknown[]) => {
      if (writes.failBatch) throw new Error('duplicate key value violates unique constraint');
      writes.batches.push(items);
      return [];
    },
  },
  sql: async () => [{ id: MANUAL_MATCH_ID_BASE + 7 }],
}));

const { logActivity } = await import('./activity-log');
const { saveManualMatch, deleteManualMatch } = await import('./manual-match-actions');

const SEASON_ID = 13;
const [manualLeague] = getManualLeagues(SEASON_ID);
const admin = { id: 'admin-1', name: 'Peter Admin', role: 'admin' };
const editedId = MANUAL_MATCH_ID_BASE + 3;

function position(): ManualMatchPositionInput {
  return {
    starter: {
      userId: crypto.randomUUID(), full: 400, clean: 200, faults: 1,
    },
    substitutions: [],
  };
}

function input(overrides: Partial<ManualMatchInput> = {}): ManualMatchInput {
  return {
    seasonId: SEASON_ID,
    leagueId: manualLeague.leagueId,
    date: '2026-09-12',
    opponent: 'Rakovice',
    isHome: true,
    opponentTotalScore: 3400,
    teamMatchPoints: null,
    opponentMatchPoints: null,
    positions: Array.from({ length: POSITION_COUNT }, position),
    ...overrides,
  };
}

beforeEach(() => {
  session.current = { user: admin };
  existingMatches.current = [{ externalId: editedId }];
  inserted.current = [];
  writes.direct = 0;
  writes.batches = [];
  writes.failBatch = false;
  vi.mocked(logActivity).mockClear();
});

describe('saveManualMatch atomicity', () => {
  function withSubstitution(): ManualMatchInput {
    const [first, ...rest] = input().positions;
    return input({
      positions: [{
        ...first,
        substitutions: [{
          userId: 'u-sub', full: 250, clean: 110, faults: 1, fromThrow: 61,
        }],
      }, ...rest],
    });
  }

  it('writes the match, its players and its links in one batch', async () => {
    expect(await saveManualMatch(withSubstitution()))
      .toEqual({ success: true, matchId: MANUAL_MATCH_ID_BASE + 7 });

    expect(writes.direct).toBe(0);
    expect(writes.batches).toHaveLength(1);
    // match upsert, link delete, dropped-player delete, player upsert, link insert
    expect(writes.batches[0]).toHaveLength(5);
  });

  it('skips the link insert when no position was substituted', async () => {
    await saveManualMatch(input());

    expect(writes.direct).toBe(0);
    expect(writes.batches[0]).toHaveLength(4);
  });

  it('reports a failed batch as an error code instead of a half-saved match', async () => {
    writes.failBatch = true;

    expect(await saveManualMatch(withSubstitution()))
      .toEqual({ success: false, error: 'unknown' });
    expect(writes.direct).toBe(0);
    expect(logActivity).not.toHaveBeenCalled();
  });
});

describe('saveManualMatch substitutions', () => {
  it('stores the chain in the manual id range, with no lane to split', async () => {
    const [first, ...rest] = input().positions;
    const withChain: ManualMatchPositionInput = {
      ...first,
      substitutions: [
        {
          userId: 'u-sub1', full: 120, clean: 60, faults: 0, fromThrow: 61,
        },
        {
          userId: 'u-sub2', full: 125, clean: 55, faults: 2, fromThrow: 91,
        },
      ],
    };

    expect(await saveManualMatch(input({ positions: [withChain, ...rest] })))
      .toEqual({ success: true, matchId: MANUAL_MATCH_ID_BASE + 7 });

    const links = inserted.current.find((i) => i.table === matchSubstitutions)?.values;
    expect(links).toEqual([
      {
        id: MANUAL_MATCH_ID_BASE + 7,
        matchId: MANUAL_MATCH_ID_BASE + 7,
        starterUserId: first.starter.userId,
        substituteUserId: 'u-sub1',
        throwNumber: 61,
        laneFaults: 0,
      },
      {
        id: MANUAL_MATCH_ID_BASE + 8,
        matchId: MANUAL_MATCH_ID_BASE + 7,
        starterUserId: 'u-sub1',
        substituteUserId: 'u-sub2',
        throwNumber: 91,
        laneFaults: 0,
      },
    ]);
  });

  it('inserts no link for a squad without substitutions', async () => {
    await saveManualMatch(input());
    expect(inserted.current.some((i) => i.table === matchSubstitutions)).toBe(false);
  });
});

describe('saveManualMatch activity', () => {
  it('records a new match under its allocated id', async () => {
    expect(await saveManualMatch(input()))
      .toEqual({ success: true, matchId: MANUAL_MATCH_ID_BASE + 7 });
    expect(logActivity).toHaveBeenCalledExactlyOnceWith(
      'admin',
      'saveManualMatch',
      { matchId: MANUAL_MATCH_ID_BASE + 7, mode: 'create' },
      admin,
    );
  });

  it('records an edit under the edited id', async () => {
    expect(await saveManualMatch(input({ externalId: editedId })))
      .toEqual({ success: true, matchId: editedId });
    expect(logActivity).toHaveBeenCalledExactlyOnceWith(
      'admin',
      'saveManualMatch',
      { matchId: editedId, mode: 'edit' },
      admin,
    );
  });

  it('records nothing for a non-admin, an invalid form or a missing match', async () => {
    session.current = { user: { ...admin, role: 'trainer' } };
    expect(await saveManualMatch(input())).toEqual({ success: false, error: 'unauthorized' });

    session.current = { user: admin };
    expect(await saveManualMatch(input({ leagueId: 368 })))
      .toEqual({ success: false, error: 'invalidLeague' });

    existingMatches.current = [];
    expect(await saveManualMatch(input({ externalId: editedId })))
      .toEqual({ success: false, error: 'notFound' });

    expect(logActivity).not.toHaveBeenCalled();
  });
});

describe('deleteManualMatch activity', () => {
  it('records the removed match', async () => {
    expect(await deleteManualMatch(editedId)).toEqual({ success: true, matchId: editedId });
    expect(logActivity).toHaveBeenCalledExactlyOnceWith(
      'admin',
      'deleteManualMatch',
      { matchId: editedId },
      admin,
    );
  });

  it('records nothing for a non-admin, a scraped match or a missing one', async () => {
    session.current = null;
    expect(await deleteManualMatch(editedId)).toEqual({ success: false, error: 'unauthorized' });

    session.current = { user: admin };
    expect(await deleteManualMatch(44568)).toEqual({ success: false, error: 'notManual' });

    existingMatches.current = [];
    expect(await deleteManualMatch(editedId)).toEqual({ success: false, error: 'notFound' });

    expect(logActivity).not.toHaveBeenCalled();
  });
});
