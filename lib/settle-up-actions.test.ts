import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const session = vi.hoisted(() => ({ current: { user: { role: 'admin' } } as unknown }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('./session', () => ({ getSession: async () => session.current }));
vi.mock('./cache', () => ({ updateSyncedData: vi.fn() }));
vi.mock('./push', () => ({ sendPersonalMoneyPushes: vi.fn() }));
vi.mock('./activity-log', () => ({ logActivity: vi.fn() }));
vi.mock('./settle-up', () => {
  class SettleUpError extends Error {
    constructor(message: string, readonly code: string) {
      super(message);
      this.name = 'SettleUpError';
    }
  }
  return {
    SettleUpError,
    settlePlayer: vi.fn(),
    settleTrainer: vi.fn(),
  };
});

const { revalidatePath } = await import('next/cache');
const { updateSyncedData } = await import('./cache');
const { sendPersonalMoneyPushes } = await import('./push');
const { logActivity } = await import('./activity-log');
const { settlePlayer, settleTrainer, SettleUpError } = await import('./settle-up');
const { settlePlayerMoney, settleTrainerMoney } = await import('./settle-up-actions');

const TRAINER_ID = '0b6f9c62-3c1e-4b8e-9a51-2f4d7e8a1c33';
const shown = { fineMatchIds: [44568, 44569], bonusMatchIds: [44569] };
const playerPush = {
  userId: 'u1', event: 'moneySettled' as const, params: { fines: 12, bonuses: 40 },
};

beforeEach(() => {
  session.current = { user: { role: 'admin' } };
  vi.mocked(settlePlayer).mockReset();
  vi.mocked(settlePlayer).mockResolvedValue({ rows: 3, push: playerPush });
  vi.mocked(settleTrainer).mockReset();
  vi.mocked(settleTrainer).mockResolvedValue({
    rows: 2, push: { userId: TRAINER_ID, event: 'trainerSettled', params: { amount: 30 } },
  });
  vi.mocked(sendPersonalMoneyPushes).mockClear();
  vi.mocked(updateSyncedData).mockClear();
  vi.mocked(revalidatePath).mockClear();
  vi.mocked(logActivity).mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('settlePlayerMoney', () => {
  it.each([
    [{ user: { role: 'player' } }],
    [{ user: { role: 'trainer' } }],
    [null],
  ])('refuses %o without touching the money', async (current) => {
    session.current = current;

    expect(await settlePlayerMoney(123, 13, shown)).toEqual({ success: false, error: 'unauthorized' });
    expect(settlePlayer).not.toHaveBeenCalled();
    expect(sendPersonalMoneyPushes).not.toHaveBeenCalled();
  });

  it('settles exactly the shown rows, invalidates every money page, and sends one push', async () => {
    expect(await settlePlayerMoney(123, 13, shown)).toEqual({ success: true });

    expect(settlePlayer).toHaveBeenCalledExactlyOnceWith(123, 13, shown);
    expect(updateSyncedData).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith('/[lang]/money', 'page');
    expect(revalidatePath).toHaveBeenCalledWith('/[lang]/money/[matchId]', 'page');
    expect(revalidatePath).toHaveBeenCalledWith('/[lang]/player/[id]', 'page');
    expect(revalidatePath).toHaveBeenCalledWith('/[lang]/trainer/[id]', 'page');
    expect(sendPersonalMoneyPushes).toHaveBeenCalledExactlyOnceWith([playerPush]);
  });

  it.each([
    ['notFound'],
    ['pendingSplit'],
    ['nothingToSettle'],
  ] as const)('maps a %s refusal to its code and changes nothing visible', async (code) => {
    vi.mocked(settlePlayer).mockRejectedValueOnce(new SettleUpError('guard', code));

    expect(await settlePlayerMoney(123, 13, shown)).toEqual({ success: false, error: code });
    expect(updateSyncedData).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(sendPersonalMoneyPushes).not.toHaveBeenCalled();
  });

  it('reports unknown for an unexpected error instead of throwing', async () => {
    vi.mocked(settlePlayer).mockRejectedValueOnce(new Error('connection lost'));

    expect(await settlePlayerMoney(123, 13, shown)).toEqual({ success: false, error: 'unknown' });
    expect(updateSyncedData).not.toHaveBeenCalled();
  });

  it.each([
    [1.5, shown],
    [123, { fineMatchIds: [0], bonusMatchIds: [] }],
    [123, { fineMatchIds: ['44568'], bonusMatchIds: [] }],
    [123, { fineMatchIds: [44568] }],
  ])('rejects the malformed input %o / %o', async (playerId, selection) => {
    expect(await settlePlayerMoney(
      playerId,
      13,
      selection as unknown as typeof shown,
    )).toEqual({ success: false, error: 'invalid' });
    expect(settlePlayer).not.toHaveBeenCalled();
  });

  it('records which admin settled whom', async () => {
    const admin = { id: 'admin-1', name: 'Peter Admin', role: 'admin' };
    session.current = { user: admin };

    await settlePlayerMoney(123, 13, shown);
    expect(logActivity).toHaveBeenCalledExactlyOnceWith(
      'admin',
      'settlePlayerMoney',
      { externalPlayerId: 123, seasonId: 13, rows: 3 },
      admin,
    );
  });
});

describe('settleTrainerMoney', () => {
  it('refuses a non-admin', async () => {
    session.current = { user: { role: 'trainer' } };

    expect(await settleTrainerMoney(TRAINER_ID, 13, [1, 2])).toEqual({ success: false, error: 'unauthorized' });
    expect(settleTrainer).not.toHaveBeenCalled();
  });

  it('settles the shown payments and sends the trainer one push', async () => {
    expect(await settleTrainerMoney(TRAINER_ID, 13, [1, 2])).toEqual({ success: true });

    expect(settleTrainer).toHaveBeenCalledExactlyOnceWith(TRAINER_ID, 13, [1, 2]);
    expect(updateSyncedData).toHaveBeenCalledTimes(1);
    expect(sendPersonalMoneyPushes).toHaveBeenCalledExactlyOnceWith([
      { userId: TRAINER_ID, event: 'trainerSettled', params: { amount: 30 } },
    ]);
  });

  it('reports notFound for an id that is not a uuid', async () => {
    expect(await settleTrainerMoney('nope', 13, [1])).toEqual({ success: false, error: 'notFound' });
    expect(settleTrainer).not.toHaveBeenCalled();
  });

  it('rejects malformed payment ids', async () => {
    expect(await settleTrainerMoney(TRAINER_ID, 13, [-1])).toEqual({ success: false, error: 'invalid' });
    expect(settleTrainer).not.toHaveBeenCalled();
  });

  it('maps nothingToSettle through', async () => {
    vi.mocked(settleTrainer).mockRejectedValueOnce(new SettleUpError('guard', 'nothingToSettle'));

    expect(await settleTrainerMoney(TRAINER_ID, 13, [1])).toEqual({ success: false, error: 'nothingToSettle' });
    expect(sendPersonalMoneyPushes).not.toHaveBeenCalled();
  });
});
