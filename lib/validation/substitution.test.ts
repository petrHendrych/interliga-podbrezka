import { describe, expect, it } from 'vitest';
import type { SheetSubstitution } from '@/lib/substitutions';
import { validateSubstitutionSplit } from '@/lib/validation/substitution';

const MID_LANE: SheetSubstitution = {
  id: 8585,
  starter_user_id: 'u-starter',
  starter_name: 'Starter',
  substitute_user_id: 'u-substitute',
  substitute_name: 'Substitute',
  throw_number: 103,
  lane: 4,
  lane_faults: 5,
  mid_lane: true,
  substitute_lane_faults: null,
  needs_fault_split: true,
};

const NONE_PAID = new Set<string>();

describe('validateSubstitutionSplit', () => {
  const split = (substituteLaneFaults: number) => validateSubstitutionSplit(
    { id: 8585, substituteLaneFaults },
    MID_LANE,
    NONE_PAID,
  );

  it.each([0, 1, 5])('accepts %i of the lane\'s 5 faults', (value) => {
    expect(split(value)).toBeNull();
  });

  it.each([-1, 6, 1.5, Number.NaN])('rejects %s as invalidFaultSplit', (value) => {
    expect(split(value)).toBe('invalidFaultSplit');
  });

  it('rejects a split of a switch at a lane start', () => {
    const atLaneStart = {
      ...MID_LANE, throw_number: 91, mid_lane: false, lane_faults: 0, needs_fault_split: false,
    };
    expect(validateSubstitutionSplit({ id: 8585, substituteLaneFaults: 0 }, atLaneStart, NONE_PAID))
      .toBe('invalidFaultSplit');
  });

  it('rejects a split of a mid-lane switch in a clean lane', () => {
    const cleanLane = { ...MID_LANE, lane_faults: 0, needs_fault_split: false };
    expect(validateSubstitutionSplit({ id: 8585, substituteLaneFaults: 0 }, cleanLane, NONE_PAID))
      .toBe('invalidFaultSplit');
  });

  it('answers notFound for a substitution of another match', () => {
    expect(validateSubstitutionSplit({ id: 1, substituteLaneFaults: 0 }, undefined, NONE_PAID))
      .toBe('notFound');
  });

  it.each(['u-starter', 'u-substitute'])('locks the split once %s has paid', (userId) => {
    expect(validateSubstitutionSplit(
      { id: 8585, substituteLaneFaults: 2 },
      MID_LANE,
      new Set([userId]),
    )).toBe('paidLocked');
  });
});
