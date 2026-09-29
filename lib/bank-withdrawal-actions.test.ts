import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import type { WithdrawalInput } from './validation/withdrawal';

const session = vi.hoisted(() => ({ current: null as unknown }));
const deletedRows = vi.hoisted(() => ({ current: [] as { id: number }[] }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('./session', () => ({ getSession: async () => session.current }));
vi.mock('./cache', () => ({ updateSyncedData: vi.fn() }));
vi.mock('./push', () => ({ sendPushToAll: vi.fn() }));
vi.mock('./activity-log', () => ({ logActivity: vi.fn() }));
vi.mock('./db', () => ({
  db: {
    insert: () => ({ values: () => ({ returning: async () => [{ id: 31 }] }) }),
    delete: () => ({ where: () => ({ returning: async () => deletedRows.current }) }),
  },
  sql: {},
}));

const { logActivity } = await import('./activity-log');
const { createWithdrawal, deleteWithdrawal } = await import('./bank-withdrawal-actions');

const admin = { id: 'admin-1', name: 'Peter Admin', role: 'admin' };
const input: WithdrawalInput = {
  amount: '120.5', description: 'Obedy po zápase', category: 'food', date: '2026-02-09',
};

beforeEach(() => {
  session.current = { user: admin };
  deletedRows.current = [{ id: 31 }];
  vi.mocked(logActivity).mockClear();
});

describe('createWithdrawal activity', () => {
  it('records the new withdrawal with its amount and category', async () => {
    expect(await createWithdrawal(input)).toEqual({ success: true, id: 31 });
    expect(logActivity).toHaveBeenCalledExactlyOnceWith(
      'admin',
      'createWithdrawal',
      { id: 31, amount: '120.50', category: 'food' },
      admin,
    );
  });

  it('records nothing for a non-admin or an invalid form', async () => {
    session.current = { user: { ...admin, role: 'player' } };
    expect(await createWithdrawal(input)).toEqual({ success: false, error: 'unauthorized' });

    session.current = { user: admin };
    expect(await createWithdrawal({ ...input, amount: '0' }))
      .toEqual({ success: false, error: 'invalidAmount' });

    expect(logActivity).not.toHaveBeenCalled();
  });
});

describe('deleteWithdrawal activity', () => {
  it('records the removed withdrawal', async () => {
    expect(await deleteWithdrawal(31)).toEqual({ success: true, id: 31 });
    expect(logActivity).toHaveBeenCalledExactlyOnceWith('admin', 'deleteWithdrawal', { id: 31 }, admin);
  });

  it('records nothing for a non-admin or a missing row', async () => {
    session.current = null;
    expect(await deleteWithdrawal(31)).toEqual({ success: false, error: 'unauthorized' });

    session.current = { user: admin };
    deletedRows.current = [];
    expect(await deleteWithdrawal(99)).toEqual({ success: false, error: 'notFound' });

    expect(logActivity).not.toHaveBeenCalled();
  });
});
