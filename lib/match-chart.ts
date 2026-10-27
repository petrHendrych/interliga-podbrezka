import { byDate, type DatedMatch } from '@/lib/player-matches';

/** `paid` also covers a match with nothing to pay: either way nothing is owed for it. */
export type MatchPaymentState = 'paid' | 'unpaid' | 'partial';

/** The two things the match chart can plot. */
export type MatchChartView = 'amount' | 'score';

/** What the shared match chart plots: one match, its amount and score, one X axis tick. */
export interface MatchChartPoint {
  matchId: number;
  amount: number;
  /** `null` leaves a gap the score line bridges. */
  score: number | null;
  paymentState: MatchPaymentState;
  shortDateLabel: string;
}

/** A stretch of the amount line in one colour, as fractions of the first-to-last match span. */
export interface PaymentStateRun {
  state: MatchPaymentState;
  start: number;
  end: number;
}

/**
 * The segment between two matches takes the state of the match it leaves, so an unpaid match
 * stays red up to the next one, which then decides the colour again. Equal neighbours merge
 * into one run; the last match starts no segment, so its state only shows on its own dot.
 */
export function paymentStateRuns(states: MatchPaymentState[]): PaymentStateRun[] {
  const segments = states.length - 1;
  const runs: PaymentStateRun[] = [];
  states.slice(0, -1).forEach((state, i) => {
    const end = (i + 1) / segments;
    const last = runs[runs.length - 1];
    if (last && last.state === state) {
      last.end = end;
    } else {
      runs.push({ state, start: i / segments, end });
    }
  });
  return runs;
}

/** A 0 total is no game at all, so the tooltip shows no score rather than "0". */
export function scoreOrNull(score: number | null): number | null {
  return score !== null && score > 0 ? score : null;
}

export interface MatchChartFormatters<T> {
  date: (iso: string) => string;
  shortDate: (iso: string) => string;
  match: (row: T) => string;
  league: (row: T) => string;
}

/** A row without a date has no place on a time axis, so it is left out of the chart. */
export function datedOldestFirst<T extends DatedMatch>(rows: T[]): Array<T & { date: string }> {
  return rows
    .filter((r): r is T & { date: string } => r.date !== null)
    .sort(byDate('asc'));
}
