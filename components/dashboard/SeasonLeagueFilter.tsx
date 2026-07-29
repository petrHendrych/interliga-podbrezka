'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { SeasonConfig } from '@/lib/season-config';

interface SeasonLeagueFilterProps {
  seasons: SeasonConfig[];
  selectedSeasonId: number;
  selectedLeagueKey: string;
  labels: {
    seasonLabel: string;
    allLeagues: string;
    interliga: string;
    pohar: string;
  };
}

export function SeasonLeagueFilter({
  seasons,
  selectedSeasonId,
  selectedLeagueKey,
  labels,
}: SeasonLeagueFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleSeasonChange = (newSeasonId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('season', newSeasonId);
    // Keep or reset league key if needed
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleLeagueChange = (newLeagueKey: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('league', newLeagueKey);
    if (!params.has('season')) {
      params.set('season', String(selectedSeasonId));
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const leagueTabs = [
    { key: 'all', label: labels.allLeagues },
    { key: 'interliga', label: labels.interliga },
    { key: 'pohar', label: labels.pohar },
  ];

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6 bg-card border border-border/80 rounded-xl p-3 shadow-sm">
      <div className="flex items-center gap-2.5">
        <label htmlFor="season-select" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
          {labels.seasonLabel}
          :
        </label>
        <select
          id="season-select"
          value={selectedSeasonId}
          onChange={(e) => handleSeasonChange(e.target.value)}
          className="bg-background border border-input rounded-lg px-3 py-1.5 text-sm font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none transition-colors cursor-pointer"
        >
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-0 scrollbar-none">
        {leagueTabs.map((tab) => {
          const isActive = selectedLeagueKey === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleLeagueChange(tab.key)}
              className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                  : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground font-medium'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
