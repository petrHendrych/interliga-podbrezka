import { describe, expect, it } from 'vitest';
import { sheetOrder } from './money-sheet-order';

interface Row {
  name: string;
  userId: string;
  isPaid: boolean;
}

const VIEWER = 'viewer';

function order(rows: Row[], viewerId: string | undefined = VIEWER): string[] {
  return [...rows]
    .sort(sheetOrder<Row>(
      (r) => r.userId === viewerId,
      (r) => !r.isPaid,
      (r) => r.name,
      'sk',
    ))
    .map((r) => r.name);
}

describe('sheetOrder', () => {
  it('puts the viewer first even when their row is paid and others are open', () => {
    expect(order([
      { name: 'Adam', userId: 'a', isPaid: false },
      { name: 'Zoltán', userId: VIEWER, isPaid: true },
    ])).toEqual(['Zoltán', 'Adam']);
  });

  it('lists open rows before paid ones among the others', () => {
    expect(order([
      { name: 'Adam', userId: 'a', isPaid: true },
      { name: 'Boris', userId: 'b', isPaid: false },
    ])).toEqual(['Boris', 'Adam']);
  });

  it('sorts by name with Slovak collation when the rest is equal', () => {
    expect(order([
      { name: 'Čech', userId: 'a', isPaid: false },
      { name: 'Cibula', userId: 'b', isPaid: false },
      { name: 'Dano', userId: 'c', isPaid: false },
    ])).toEqual(['Cibula', 'Čech', 'Dano']);
  });

  it('keeps open-first among several rows of the viewer', () => {
    expect(order([
      { name: 'Tréner A', userId: VIEWER, isPaid: true },
      { name: 'Adam', userId: 'a', isPaid: false },
      { name: 'Tréner B', userId: VIEWER, isPaid: false },
    ])).toEqual(['Tréner B', 'Tréner A', 'Adam']);
  });

  it('orders exactly as before when the viewer has no row', () => {
    expect(order([
      { name: 'Boris', userId: 'b', isPaid: true },
      { name: 'Adam', userId: 'a', isPaid: false },
    ], undefined)).toEqual(['Adam', 'Boris']);
  });
});
