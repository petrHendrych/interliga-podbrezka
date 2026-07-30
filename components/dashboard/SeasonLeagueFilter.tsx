'use client';

import { useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { SeasonConfig } from '@/lib/season-config';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

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
  const [isPending, startTransition] = useTransition();

  const handleSeasonChange = (newSeasonId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('season', newSeasonId);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const handleLeagueChange = (newLeagueKey: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('league', newLeagueKey);
    if (!params.has('season')) {
      params.set('season', String(selectedSeasonId));
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const leagueTabs = [
    { key: 'all', label: labels.allLeagues },
    { key: 'interliga', label: labels.interliga },
    { key: 'pohar', label: labels.pohar },
  ];

  const seasonItems = seasons.map((s) => ({
    value: String(s.id),
    label: s.name,
  }));

  return (
    <div
      className={`flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6 bg-card border border-border/80 rounded-xl p-3 shadow-sm transition-opacity duration-200 ${
        isPending ? 'opacity-75' : ''
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap flex items-center gap-1.5">
          {`${labels.seasonLabel}:`}
        </span>
        <Select
          value={String(selectedSeasonId)}
          onValueChange={(value) => {
            if (value) handleSeasonChange(value);
          }}
          items={seasonItems}
          disabled={isPending}
        >
          <SelectTrigger className="w-[150px] sm:w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {seasons.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-0 scrollbar-none">
        {leagueTabs.map((tab) => {
          const isActive = selectedLeagueKey === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              disabled={isPending}
              onClick={() => handleLeagueChange(tab.key)}
              className={`inline-flex items-center justify-center px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors hover:cursor-pointer whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-80 ${
                isActive
                  ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                  : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground font-medium'
              }`}
            >
              {isPending && isActive && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin text-current" />
              )}
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
