import { getLeagueByLeagueId, type LeagueKey } from '@/lib/season-config';
import type { Dictionary } from './types';

/**
 * `matches.league_name` and `LeagueConfig.name` are Slovak by definition, so every
 * competition shown in the UI has to go through the dictionary instead.
 */
export function leagueLabels(dict: Dictionary): Record<LeagueKey, string> {
  return {
    interliga: dict.playerDetail.leagueInterliga,
    pohar: dict.playerDetail.leagueCup,
    svetovypohar: dict.playerDetail.leagueWorldCup,
    ligamajstrov: dict.playerDetail.leagueChampions,
  };
}

export function leagueLabelForKey(key: LeagueKey, dict: Dictionary): string {
  return leagueLabels(dict)[key];
}

/** Falls back to the stored name for rows whose league is not in the config. */
export function leagueLabelForId(
  leagueId: number | null,
  fallback: string | null,
  dict: Dictionary,
): string {
  const key = leagueId !== null ? getLeagueByLeagueId(leagueId)?.key : undefined;
  if (key) return leagueLabels(dict)[key];
  return fallback || '-';
}
