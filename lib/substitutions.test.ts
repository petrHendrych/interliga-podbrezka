import { describe, expect, it } from 'vitest';
import {
  type LaneResult,
  type ManualSegment,
  changeLaneFaults,
  extractSubstitutionCandidates,
  isLaneStart,
  isSubstitutionThrow,
  manualSegmentsFromRows,
  splitManualPosition,
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
    manual: false,
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

function segment(
  userId: string,
  fromThrow: number,
  full: number,
  clean: number,
  faults = 0,
): ManualSegment {
  return {
    userId, fromThrow, full, clean, faults,
  };
}

const STARTER = segment('u-starter', 1, 260, 120, 2);
const SUB_61 = segment('u-sub', 61, 250, 110, 1);

describe('splitManualPosition', () => {
  it('keeps a position without a substitution as a plain row', () => {
    expect(splitManualPosition([segment('u-a', 1, 400, 210, 3)])).toEqual([{
      userId: 'u-a',
      full: 400,
      clean: 210,
      total: 610,
      faults: 3,
      substitutionRole: null,
      positionTotal: null,
      positionShare: null,
    }]);
  });

  it('halves the share on a switch at 61, the starter holding the position', () => {
    const [starter, sub] = splitManualPosition([STARTER, SUB_61]);
    expect(starter).toEqual({
      userId: 'u-starter',
      full: 510,
      clean: 230,
      total: 740,
      faults: 2,
      substitutionRole: 'major',
      positionTotal: 740,
      positionShare: 0.5,
    });
    expect(sub).toEqual({
      userId: 'u-sub',
      full: 250,
      clean: 110,
      total: 360,
      faults: 1,
      substitutionRole: 'minor',
      positionTotal: 740,
      positionShare: 0.5,
    });
  });

  it('hands the position to the substitute on a switch at 31', () => {
    const [starter, sub] = splitManualPosition([
      segment('u-starter', 1, 90, 40, 1),
      segment('u-sub', 31, 330, 160, 4),
    ]);
    expect(starter).toMatchObject({
      substitutionRole: 'minor', total: 130, faults: 1, positionTotal: 620, positionShare: 0,
    });
    expect(sub).toMatchObject({
      substitutionRole: 'major', full: 420, clean: 200, total: 620, faults: 4, positionShare: 1,
    });
  });

  it('keeps the position on the starter on a switch at 91', () => {
    const rows = splitManualPosition([
      segment('u-starter', 1, 330, 160),
      segment('u-sub', 91, 90, 40),
    ]);
    expect(rows.map((r) => [r.substitutionRole, r.positionShare]))
      .toEqual([['major', 1], ['minor', 0]]);
  });

  it.each([
    [2, ['minor', 'major']],
    [120, ['major', 'minor']],
  ])('gives one throw the minor row on a switch at %i', (fromThrow, roles) => {
    const rows = splitManualPosition([
      segment('u-starter', 1, 100, 50),
      segment('u-sub', fromThrow, 100, 50),
    ]);
    expect(rows.map((r) => r.substitutionRole)).toEqual(roles);
  });

  it('keeps the position on a starter of 60 throws in a chain 61 → 91', () => {
    const rows = splitManualPosition([
      segment('u-starter', 1, 250, 120, 1),
      segment('u-sub1', 61, 120, 60, 0),
      segment('u-sub2', 91, 125, 55, 2),
    ]);
    expect(rows.map((r) => [r.substitutionRole, r.positionShare, r.total, r.faults])).toEqual([
      ['major', 1, 730, 1],
      ['minor', 0, 180, 0],
      ['minor', 0, 180, 2],
    ]);
    expect(rows.every((r) => r.positionTotal === 730)).toBe(true);
  });

  it('hands the position to the second substitute with 60 throws in a chain 31 → 61', () => {
    const rows = splitManualPosition([
      segment('u-starter', 1, 120, 60),
      segment('u-sub1', 31, 125, 55),
      segment('u-sub2', 61, 250, 120),
    ]);
    expect(rows.map((r) => [r.userId, r.substitutionRole, r.positionShare])).toEqual([
      ['u-starter', 'minor', 0],
      ['u-sub1', 'minor', 0],
      ['u-sub2', 'major', 1],
    ]);
    expect(rows[2].total).toBe(730);
  });

  it('splits a three-way tie (41 → 81) in thirds, the starter holding the stats', () => {
    const rows = splitManualPosition([
      segment('u-starter', 1, 160, 80),
      segment('u-sub1', 41, 160, 70),
      segment('u-sub2', 81, 150, 80),
    ]);
    expect(rows.map((r) => [r.substitutionRole, r.positionShare])).toEqual([
      ['major', 1 / 3],
      ['minor', 1 / 3],
      ['minor', 1 / 3],
    ]);
    expect(rows[0].total).toBe(700);
  });
});

describe('manualSegmentsFromRows', () => {
  it.each([
    ['no substitution', [segment('u-a', 1, 400, 210, 3)]],
    ['a switch at 61', [STARTER, SUB_61]],
    ['a switch at 31', [segment('u-starter', 1, 90, 40, 1), segment('u-sub', 31, 330, 160, 4)]],
    ['a switch at 91', [segment('u-starter', 1, 330, 160), segment('u-sub', 91, 90, 40, 2)]],
    ['a chain 61 → 91', [
      segment('u-starter', 1, 250, 120, 1),
      segment('u-sub1', 61, 120, 60),
      segment('u-sub2', 91, 125, 55, 2),
    ]],
    ['a chain 31 → 61', [
      segment('u-starter', 1, 120, 60),
      segment('u-sub1', 31, 125, 55, 1),
      segment('u-sub2', 61, 250, 120),
    ]],
    ['a chain 41 → 81', [
      segment('u-starter', 1, 160, 80),
      segment('u-sub1', 41, 160, 70),
      segment('u-sub2', 81, 150, 80, 1),
    ]],
  ])('recovers every player\'s own part after %s', (_, segments) => {
    const rows = new Map(splitManualPosition(segments).map((r) => [r.userId, {
      full: r.full, clean: r.clean, faults: r.faults, role: r.substitutionRole,
    }]));
    const chain = segments.map(({ userId, fromThrow }) => ({ userId, fromThrow }));
    expect(manualSegmentsFromRows(chain, rows)).toEqual(segments);
  });
});
