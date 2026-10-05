/** Substitutions are split from 2026/2027 on; earlier seasons keep the whole row on the starter. */
export const SUBSTITUTION_FIRST_SEASON_ID = 13;
export const THROWS_PER_LANE = 30;
export const LANES_PER_GAME = 4;
export const THROWS_PER_GAME = THROWS_PER_LANE * LANES_PER_GAME;

export type SubstitutionRole = 'major' | 'minor';

export interface LaneResult {
  full: number;
  clean: number;
  total: number;
  faults: number;
}

export interface SegmentRow {
  role: SubstitutionRole;
  throws: number;
  full: number;
  clean: number;
  total: number;
  faults: number;
  positionTotal: number;
  /** Share of the total-based fines and bonus: 1 / 0.5 / 0. */
  positionShare: number;
}

export interface PositionSplit {
  /** Mid-lane switch in a lane with faults, and the admin has not split them yet. */
  needsFaultSplit: boolean;
  /** Null on a switch at throw 1: the starter bowled nothing and gets no row. */
  starter: SegmentRow | null;
  substitute: SegmentRow;
}

export interface SplitPositionInput {
  throwNumber: number;
  /** In API array order — the API sends the first lane's number as an empty string. */
  lanes: LaneResult[];
  position: LaneResult;
  splitLaneSubstituteFaults: number | null;
}

export function isSubstitutionThrow(throwNumber: number): boolean {
  return Number.isInteger(throwNumber) && throwNumber >= 1 && throwNumber <= THROWS_PER_GAME;
}

/** A switch on 1, 31, 61 or 91 splits exactly by lane; any other throw needs the admin's review. */
export function isLaneStart(throwNumber: number): boolean {
  return (throwNumber - 1) % THROWS_PER_LANE === 0;
}

/** Zero-based index of the lane the substitute's first throw falls in. */
export function laneIndexOfThrow(throwNumber: number): number {
  return Math.floor((throwNumber - 1) / THROWS_PER_LANE);
}

export function changeLaneFaults(throwNumber: number, lanes: LaneResult[]): number {
  return lanes[laneIndexOfThrow(throwNumber)]?.faults ?? 0;
}

function sumLanes(lanes: LaneResult[]): LaneResult {
  return lanes.reduce(
    (sum, lane) => ({
      full: sum.full + lane.full,
      clean: sum.clean + lane.clean,
      total: sum.total + lane.total,
      faults: sum.faults + lane.faults,
    }),
    {
      full: 0, clean: 0, total: 0, faults: 0,
    },
  );
}

interface SourcePlayer {
  id?: number;
  firstName?: string;
  lastName?: string;
  name?: string;
}

/** The slice of a `match_detail` payload the substitution split reads. */
export interface SubstitutionSource {
  lineUp?: {
    [side: string]: {
      player?: SourcePlayer;
      full?: number;
      clean?: number;
      total?: number;
      faults?: number;
      teamId?: number;
      lanes?: Partial<LaneResult>[];
    }[];
  };
  substitutions?: {
    id?: number;
    teamState?: string;
    throwNumber?: number;
    player?: SourcePlayer;
    newPlayer?: SourcePlayer;
  }[];
}

export interface SubstitutionCandidate {
  substitutionId: number;
  matchId: number;
  opponent: string;
  throwNumber: number;
  teamId: number | null;
  starter: { externalId: number; name: string };
  substitute: { externalId: number; name: string };
  position: LaneResult;
  lanes: LaneResult[];
}

/** What the admin is told about a mid-lane switch, which only they can split. */
export interface SubstitutionReview {
  substitutionId: number;
  matchId: number;
  opponent: string;
  starterName: string;
  substituteName: string;
  throwNumber: number;
  /** One-based, as the lanes are numbered at the hall. */
  lane: number;
  laneFaults: number;
}

function playerName(player: SourcePlayer, externalId: number): string {
  return [player.firstName, player.lastName].filter(Boolean).join(' ')
    || player.name
    || `Player ${externalId}`;
}

function toLane(lane: Partial<LaneResult>): LaneResult {
  return {
    full: Number(lane.full ?? 0),
    clean: Number(lane.clean ?? 0),
    total: Number(lane.total ?? 0),
    faults: Number(lane.faults ?? 0),
  };
}

/**
 * Our side's substitutions in one `match_detail` payload, each paired with the starter's lineUp
 * row. Null when the payload carries no `substitutions` field at all — an old snapshot, which
 * must never undo a split. A chained substitution (the substitute replaced again) and a
 * substitute who also holds a lineUp position are skipped: the API keeps one result row per
 * position, so neither can be split.
 */
export function extractSubstitutionCandidates(
  data: SubstitutionSource,
  teamKey: 'home' | 'away',
  matchId: number,
  opponent: string,
): SubstitutionCandidate[] | null {
  if (!Array.isArray(data.substitutions)) return null;

  const lineUp = data.lineUp?.[teamKey] ?? [];
  const ours = data.substitutions.filter((s) => s.teamState === teamKey);
  const starterIds = ours.map((s) => s.player?.id);
  const substituteIds = ours.map((s) => s.newPlayer?.id);
  const lineUpIds = lineUp.map((row) => row.player?.id);

  return ours.flatMap((s) => {
    const starterId = s.player?.id;
    const substituteId = s.newPlayer?.id;
    if (!s.id || !starterId || !substituteId || !s.player || !s.newPlayer) return [];
    if (!isSubstitutionThrow(Number(s.throwNumber))) return [];
    if (starterIds.filter((id) => id === starterId).length > 1) return [];
    if (substituteIds.includes(starterId) || starterIds.includes(substituteId)) return [];
    if (lineUpIds.includes(substituteId)) return [];

    const row = lineUp.find((r) => r.player?.id === starterId);
    if (!row) return [];

    return [{
      substitutionId: s.id,
      matchId,
      opponent,
      throwNumber: Number(s.throwNumber),
      teamId: row.teamId ?? null,
      starter: { externalId: starterId, name: playerName(s.player, starterId) },
      substitute: { externalId: substituteId, name: playerName(s.newPlayer, substituteId) },
      position: toLane(row),
      lanes: (row.lanes ?? []).map(toLane),
    }];
  });
}

/** The admin is asked to look at every switch that falls inside a lane. */
export function toSubstitutionReview(candidate: SubstitutionCandidate): SubstitutionReview | null {
  if (isLaneStart(candidate.throwNumber)) return null;
  return {
    substitutionId: candidate.substitutionId,
    matchId: candidate.matchId,
    opponent: candidate.opponent,
    starterName: candidate.starter.name,
    substituteName: candidate.substitute.name,
    throwNumber: candidate.throwNumber,
    lane: laneIndexOfThrow(candidate.throwNumber) + 1,
    laneFaults: changeLaneFaults(candidate.throwNumber, candidate.lanes),
  };
}

/** A shared position as the money sheet, the CLI and the skill read it. */
export interface SheetSubstitution {
  id: number;
  starter_user_id: string;
  starter_name: string;
  substitute_user_id: string;
  substitute_name: string;
  throw_number: number;
  /** One-based lane the substitute's first throw falls in. */
  lane: number;
  /** Faults of that lane, the only ones the data cannot attribute on a mid-lane switch. */
  lane_faults: number;
  mid_lane: boolean;
  /** The admin's split; null until entered, and the lane's faults stay with the starter. */
  substitute_lane_faults: number | null;
  needs_fault_split: boolean;
}

export function toSheetSubstitution(row: {
  id: number;
  starterUserId: string;
  starterName: string;
  substituteUserId: string;
  substituteName: string;
  throwNumber: number;
  laneFaults: number;
  splitLaneSubstituteFaults: number | null;
}): SheetSubstitution {
  const midLane = !isLaneStart(row.throwNumber);
  return {
    id: row.id,
    starter_user_id: row.starterUserId,
    starter_name: row.starterName,
    substitute_user_id: row.substituteUserId,
    substitute_name: row.substituteName,
    throw_number: row.throwNumber,
    lane: laneIndexOfThrow(row.throwNumber) + 1,
    lane_faults: midLane ? row.laneFaults : 0,
    mid_lane: midLane,
    substitute_lane_faults: row.splitLaneSubstituteFaults,
    needs_fault_split: midLane && row.laneFaults > 0 && row.splitLaneSubstituteFaults === null,
  };
}

/**
 * Splits one shared lineUp position between the starter and the substitute. The player with
 * more throws keeps the position result (stats and the total-based rules); the other one keeps
 * only the pins of the lanes they bowled whole. Faults go to whoever bowled them; a mid-lane
 * lane's faults stay with the starter until the admin splits them. Returns null when the lanes
 * cannot be read, so the caller leaves the position whole.
 */
export function splitPosition({
  throwNumber,
  lanes,
  position,
  splitLaneSubstituteFaults,
}: SplitPositionInput): PositionSplit | null {
  if (!isSubstitutionThrow(throwNumber) || lanes.length !== LANES_PER_GAME) return null;

  const starterThrows = throwNumber - 1;
  const substituteThrows = THROWS_PER_GAME - starterThrows;

  if (starterThrows === 0) {
    return {
      needsFaultSplit: false,
      starter: null,
      substitute: {
        role: 'major',
        throws: substituteThrows,
        ...position,
        positionTotal: position.total,
        positionShare: 1,
      },
    };
  }

  const changeLane = laneIndexOfThrow(throwNumber);
  const onBoundary = isLaneStart(throwNumber);
  const starterLanes = sumLanes(lanes.slice(0, changeLane));
  const substituteLanes = sumLanes(lanes.slice(onBoundary ? changeLane : changeLane + 1));

  const laneFaults = onBoundary ? 0 : lanes[changeLane].faults;
  const needsFaultSplit = laneFaults > 0 && splitLaneSubstituteFaults === null;
  const substituteLaneFaults = needsFaultSplit
    ? 0
    : Math.min(Math.max(splitLaneSubstituteFaults ?? 0, 0), laneFaults);

  // The position's fault count stays authoritative, so the split always sums back to it.
  const substituteFaults = Math.min(substituteLanes.faults + substituteLaneFaults, position.faults);
  const starterFaults = position.faults - substituteFaults;

  const isHalf = starterThrows === substituteThrows;
  const starterIsMajor = starterThrows >= substituteThrows;
  const majorShare = isHalf ? 0.5 : 1;
  const minorShare = isHalf ? 0.5 : 0;

  const segment = (
    isMajor: boolean,
    throws: number,
    lanePins: LaneResult,
    faults: number,
  ): SegmentRow => ({
    role: isMajor ? 'major' : 'minor',
    throws,
    full: isMajor ? position.full : lanePins.full,
    clean: isMajor ? position.clean : lanePins.clean,
    total: isMajor ? position.total : lanePins.total,
    faults,
    positionTotal: position.total,
    positionShare: isMajor ? majorShare : minorShare,
  });

  return {
    needsFaultSplit,
    starter: segment(starterIsMajor, starterThrows, starterLanes, starterFaults),
    substitute: segment(!starterIsMajor, substituteThrows, substituteLanes, substituteFaults),
  };
}
