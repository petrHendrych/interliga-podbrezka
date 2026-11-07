import type { ChangelogEntry } from '../types';
import changelogDialog from './2026-10-26-changelog-dialog';
import matchMoneyChart from './2026-10-26-match-money-chart';
import settleUpButton from './2026-11-07-settle-up-button';

// Listed by hand: a serverless function cannot rely on reading this directory at runtime.
export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  changelogDialog,
  matchMoneyChart,
  settleUpButton,
];
