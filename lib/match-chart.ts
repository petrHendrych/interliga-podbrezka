import { byDate, type DatedMatch } from '@/lib/player-matches';

/** What the shared match chart plots: one match, one amount, one X axis tick. */
export interface MatchChartPoint {
  matchId: number;
  amount: number;
  shortDateLabel: string;
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
