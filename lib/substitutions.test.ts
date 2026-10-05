import { describe, expect, it } from 'vitest';
import {
  type LaneResult,
  changeLaneFaults,
  extractSubstitutionCandidates,
  isLaneStart,
  isSubstitutionThrow,
  splitPosition,
  toSheetSubstitution,
  toSubstitutionReview,
} from '@/lib/substitutions';

function lane(total: number, faults = 0): LaneResult {
  return {
    full: Math.round(total * 0.65), clean: total - Math.round(total * 0.65), total, faults,
  };
}

function positionOf(lanes: LaneResult[]): LaneResult {
  return lanes.reduce((sum, l) => ({
    full: sum.full + l.full,
    clean: sum.clean + l.clean,
    total: sum.total + l.total,
    faults: sum.faults + l.faults,
  }), {
    full: 0, clean: 0, total: 0, faults: 0,
  });
}

// Match 44990: Vadovič → Dubrava at throw 91.
const JIHLAVA_LANES: LaneResult[] = [
  {
    full: 100, clean: 76, total: 176, faults: 0,
  },
  {
    full: 101, clean: 54, total: 155, faults: 0,
  },
  {
    full: 102, clean: 53, total: 155, faults: 0,
  },
  {
    full: 103, clean: 52, total: 155, faults: 0,
  },
];

describe('isLaneStart', () => {
  it.each([1, 31, 61, 91])('throw %i starts a lane, no review needed', (throwNumber) => {
    expect(isLaneStart(throwNumber)).toBe(true);
  });

  it.each([2, 30, 32, 63, 103, 120])('throw %i falls mid-lane and needs review', (throwNumber) => {
    expect(isLaneStart(throwNumber)).toBe(false);
  });
});

describe('isSubstitutionThrow', () => {
  it.each([
    [1, true],
    [120, true],
    [0, false],
    [121, false],
    [60.5, false],
  ])('throw %s is a valid switch: %s', (throwNumber, expected) => {
    expect(isSubstitutionThrow(throwNumber)).toBe(expected);
  });
});

describe('changeLaneFaults', () => {
  it('reads the faults of the lane the switch falls in', () => {
    const lanes = [lane(150, 1), lane(150, 0), lane(150, 4), lane(150, 5)];
    expect(changeLaneFaults(103, lanes)).toBe(5);
    expect(changeLaneFaults(63, lanes)).toBe(4);
  });
});

describe('splitPosition', () => {
  it('splits the Jihlava switch at 91: Vadovič keeps 641, Dubrava gets lane 4', () => {
    const split = splitPosition({
      throwNumber: 91,
      lanes: JIHLAVA_LANES,
      position: {
        full: 406, clean: 235, total: 641, faults: 0,
      },
      splitLaneSubstituteFaults: null,
    });

    expect(split).toEqual({
      needsFaultSplit: false,
      starter: {
        role: 'major',
        throws: 90,
        full: 406,
        clean: 235,
        total: 641,
        faults: 0,
        positionTotal: 641,
        positionShare: 1,
      },
      substitute: {
        role: 'minor',
        throws: 30,
        full: 103,
        clean: 52,
        total: 155,
        faults: 0,
        positionTotal: 641,
        positionShare: 0,
      },
    });
  });

  it.each([
    [31, 1, 9],
    [61, 3, 7],
    [91, 6, 4],
  ])('a switch at %i splits faults exactly by lane (%i / %i)', (throwNumber, starterFaults, substituteFaults) => {
    const lanes = [lane(150, 1), lane(150, 2), lane(150, 3), lane(150, 4)];
    const split = splitPosition({
      throwNumber, lanes, position: positionOf(lanes), splitLaneSubstituteFaults: null,
    });

    expect(split?.needsFaultSplit).toBe(false);
    expect(split?.starter?.faults).toBe(starterFaults);
    expect(split?.substitute.faults).toBe(substituteFaults);
  });

  it('makes the substitute the majority on a switch at 31', () => {
    const lanes = [lane(160), lane(150), lane(150), lane(150)];
    const split = splitPosition({
      throwNumber: 31, lanes, position: positionOf(lanes), splitLaneSubstituteFaults: null,
    });

    expect(split?.starter).toMatchObject({
      role: 'minor', throws: 30, total: 160, positionShare: 0,
    });
    expect(split?.substitute).toMatchObject({
      role: 'major', throws: 90, total: 610, positionShare: 1,
    });
  });

  it('halves the total-based share on a switch at 61, the starter keeping the stats', () => {
    const lanes = [lane(150), lane(150), lane(150), lane(140)];
    const split = splitPosition({
      throwNumber: 61, lanes, position: positionOf(lanes), splitLaneSubstituteFaults: null,
    });

    expect(split?.starter).toMatchObject({
      role: 'major', throws: 60, total: 590, positionTotal: 590, positionShare: 0.5,
    });
    expect(split?.substitute).toMatchObject({
      role: 'minor', throws: 60, total: 290, positionTotal: 590, positionShare: 0.5,
    });
  });

  it('needs no admin split on a mid-lane switch when that lane has no faults', () => {
    const lanes = [lane(127, 2), lane(134), lane(156), lane(164)];
    const split = splitPosition({
      throwNumber: 63, lanes, position: positionOf(lanes), splitLaneSubstituteFaults: null,
    });

    expect(split?.needsFaultSplit).toBe(false);
    expect(split?.starter?.faults).toBe(2);
    expect(split?.substitute.faults).toBe(0);
  });

  it('keeps a mid-lane lane\'s faults on the starter until the admin splits them', () => {
    const lanes = [lane(133, 1), lane(144), lane(124, 4), lane(126, 5)];
    const split = splitPosition({
      throwNumber: 103, lanes, position: positionOf(lanes), splitLaneSubstituteFaults: null,
    });

    expect(split?.needsFaultSplit).toBe(true);
    expect(split?.starter?.faults).toBe(10);
    expect(split?.substitute.faults).toBe(0);
    expect(split?.substitute.total).toBe(0);
  });

  it('applies the admin split of a mid-lane lane', () => {
    const lanes = [lane(133, 1), lane(144), lane(124, 4), lane(126, 5)];
    const split = splitPosition({
      throwNumber: 103, lanes, position: positionOf(lanes), splitLaneSubstituteFaults: 3,
    });

    expect(split?.needsFaultSplit).toBe(false);
    expect(split?.starter?.faults).toBe(7);
    expect(split?.substitute.faults).toBe(3);
  });

  it('clamps an admin split above the lane\'s faults', () => {
    const lanes = [lane(150), lane(150), lane(150), lane(150, 2)];
    const split = splitPosition({
      throwNumber: 100, lanes, position: positionOf(lanes), splitLaneSubstituteFaults: 9,
    });

    expect(split?.substitute.faults).toBe(2);
    expect(split?.starter?.faults).toBe(0);
  });

  it('hands the whole row to the substitute on a switch at throw 1', () => {
    const lanes = [lane(164), lane(147), lane(152, 1), lane(148)];
    const position = positionOf(lanes);
    const split = splitPosition({
      throwNumber: 1, lanes, position, splitLaneSubstituteFaults: null,
    });

    expect(split?.starter).toBeNull();
    expect(split?.substitute).toEqual({
      role: 'major', throws: 120, ...position, positionTotal: position.total, positionShare: 1,
    });
  });

  it.each([2, 31, 45, 61, 77, 91, 103, 120])('faults always sum back to the position at throw %i', (throwNumber) => {
    const lanes = [lane(150, 3), lane(150, 1), lane(150, 2), lane(150, 4)];
    const split = splitPosition({
      throwNumber, lanes, position: positionOf(lanes), splitLaneSubstituteFaults: 1,
    });

    expect((split?.starter?.faults ?? 0) + (split?.substitute.faults ?? 0)).toBe(10);
  });

  it('refuses to split without four lanes', () => {
    expect(splitPosition({
      throwNumber: 91,
      lanes: [lane(150)],
      position: lane(600),
      splitLaneSubstituteFaults: null,
    })).toBeNull();
  });
});

const JIHLAVA_PAYLOAD = {
  lineUp: {
    away: [
      {
        player: { id: 20299, firstName: 'Bystrík', lastName: 'Vadovič' },
        full: 406,
        clean: 235,
        total: 641,
        faults: 0,
        teamId: 5008,
        lanes: JIHLAVA_LANES,
      },
      {
        player: { id: 170512, firstName: 'Rostislav', lastName: 'Gorecký' },
        full: 426,
        clean: 249,
        total: 675,
        faults: 0,
        teamId: 5008,
      },
    ],
    home: [
      {
        player: { id: 134008, firstName: 'Miroslav', lastName: 'Pleskal' },
        total: 611,
        faults: 1,
      },
    ],
  },
  substitutions: [
    {
      id: 8585,
      teamState: 'away',
      throwNumber: 91,
      player: { id: 20299, firstName: 'Bystrík', lastName: 'Vadovič' },
      newPlayer: { id: 19055, firstName: 'Šimon', lastName: 'Dubrava' },
    },
    {
      id: 8587,
      teamState: 'home',
      throwNumber: 1,
      player: { id: 134008, firstName: 'Miroslav', lastName: 'Pleskal' },
      newPlayer: { id: 127639, firstName: 'Daniel', lastName: 'Braun' },
    },
  ],
};

describe('extractSubstitutionCandidates', () => {
  it('pairs our side\'s substitution with the starter\'s lineUp row', () => {
    const candidates = extractSubstitutionCandidates(JIHLAVA_PAYLOAD, 'away', 44990, 'KK Jihlava');

    expect(candidates).toEqual([{
      substitutionId: 8585,
      matchId: 44990,
      opponent: 'KK Jihlava',
      throwNumber: 91,
      teamId: 5008,
      starter: { externalId: 20299, name: 'Bystrík Vadovič' },
      substitute: { externalId: 19055, name: 'Šimon Dubrava' },
      position: {
        full: 406, clean: 235, total: 641, faults: 0,
      },
      lanes: JIHLAVA_LANES,
    }]);
  });

  it('returns null for a snapshot taken before substitutions were requested', () => {
    expect(extractSubstitutionCandidates({ lineUp: JIHLAVA_PAYLOAD.lineUp }, 'away', 1, '')).toBeNull();
  });

  it('returns an empty list when the API reports no substitutions', () => {
    expect(extractSubstitutionCandidates({ ...JIHLAVA_PAYLOAD, substitutions: [] }, 'away', 1, '')).toEqual([]);
  });

  it('skips a substitute who also holds a lineUp position', () => {
    const payload = {
      ...JIHLAVA_PAYLOAD,
      substitutions: [{
        ...JIHLAVA_PAYLOAD.substitutions[0],
        newPlayer: { id: 170512, firstName: 'Rostislav', lastName: 'Gorecký' },
      }],
    };
    expect(extractSubstitutionCandidates(payload, 'away', 1, '')).toEqual([]);
  });

  it('skips a chained substitution, which one row cannot represent', () => {
    const payload = {
      ...JIHLAVA_PAYLOAD,
      substitutions: [
        JIHLAVA_PAYLOAD.substitutions[0],
        {
          id: 9000,
          teamState: 'away',
          throwNumber: 100,
          player: { id: 19055 },
          newPlayer: { id: 555 },
        },
      ],
    };
    expect(extractSubstitutionCandidates(payload, 'away', 1, '')).toEqual([]);
  });
});

describe('toSubstitutionReview', () => {
  const [candidate] = extractSubstitutionCandidates(JIHLAVA_PAYLOAD, 'away', 44990, 'KK Jihlava')!;

  it('asks nothing for a switch at the start of a lane', () => {
    expect(toSubstitutionReview(candidate)).toBeNull();
  });

  it('reports a mid-lane switch with its lane and that lane\'s faults', () => {
    const lanes = [lane(150), lane(150), lane(150), lane(150, 5)];
    expect(toSubstitutionReview({ ...candidate, throwNumber: 103, lanes })).toEqual({
      substitutionId: 8585,
      matchId: 44990,
      opponent: 'KK Jihlava',
      starterName: 'Bystrík Vadovič',
      substituteName: 'Šimon Dubrava',
      throwNumber: 103,
      lane: 4,
      laneFaults: 5,
    });
  });
});

describe('toSheetSubstitution', () => {
  const row = {
    id: 8585,
    starterUserId: 'u-vadovic',
    starterName: 'Bystrík Vadovič',
    substituteUserId: 'u-dubrava',
    substituteName: 'Šimon Dubrava',
    throwNumber: 103,
    laneFaults: 5,
    splitLaneSubstituteFaults: null,
  };

  it('flags a mid-lane switch with faults as waiting for the split', () => {
    expect(toSheetSubstitution(row)).toMatchObject({
      lane: 4, lane_faults: 5, mid_lane: true, needs_fault_split: true,
    });
  });

  it('stops flagging once the admin has split it', () => {
    const split = toSheetSubstitution({ ...row, splitLaneSubstituteFaults: 2 });
    expect(split.needs_fault_split).toBe(false);
  });

  it('never needs a split for a clean lane or a switch at a lane start', () => {
    expect(toSheetSubstitution({ ...row, laneFaults: 0 }).needs_fault_split).toBe(false);
    expect(toSheetSubstitution({ ...row, throwNumber: 91 })).toMatchObject({
      mid_lane: false, lane_faults: 0, needs_fault_split: false,
    });
  });
});
