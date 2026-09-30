import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { MANUAL_MATCH_ID_BASE, getManualLeagues } from './season-config';
import type { ManualMatchInput } from './validation/manual-match';

const session = vi.hoisted(() => ({ current: null as unknown }));
const existingMatches = vi.hoisted(() => ({ current: [] as { externalId: number }[] }));

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
    insert: () => ({ values: () => ({ onConflictDoUpdate: async () => undefined }) }),
    delete: () => ({ where: async () => undefined }),
    batch: async () => [],
  },
  sql: async () => [{ id: MANUAL_MATCH_ID_BASE + 7 }],
}));

const { logActivity } = await import('./activity-log');
const { saveManualMatch, deleteManualMatch } = await import('./manual-match-actions');

const SEASON_ID = 13;
const [manualLeague] = getManualLeagues(SEASON_ID);
const admin = { id: 'admin-1', name: 'Peter Admin', role: 'admin' };
const editedId = MANUAL_MATCH_ID_BASE + 3;

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
    players: [
      {
        userId: crypto.randomUUID(), full: 400, clean: 200, faults: 1,
      },
      {
        userId: crypto.randomUUID(), full: 390, clean: 210, faults: 0,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  session.current = { user: admin };
  existingMatches.current = [{ externalId: editedId }];
  vi.mocked(logActivity).mockClear();
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
