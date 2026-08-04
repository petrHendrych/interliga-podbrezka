'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, Plus, Save, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { saveManualMatch, type ManualMatchError } from '@/lib/manual-match-actions';
import type { ManualMatchDetail, SelectablePlayer } from '@/lib/manual-matches';

/** Season and its manual competitions, flattened for the client. */
export interface ManualSeasonOption {
  id: number;
  name: string;
  leagues: { leagueId: number; name: string }[];
}

export interface ManualMatchFormTranslations {
  formTitleCreate: string;
  formTitleEdit: string;
  season: string;
  competition: string;
  date: string;
  datePlaceholder: string;
  opponent: string;
  opponentPlaceholder: string;
  venue: string;
  home: string;
  away: string;
  opponentTotalScore: string;
  optional: string;
  players: string;
  playersHint: string;
  player: string;
  playerPlaceholder: string;
  full: string;
  clean: string;
  total: string;
  faults: string;
  addPlayer: string;
  removePlayer: string;
  teamTotal: string;
  save: string;
  saving: string;
  cancelEdit: string;
  errors: Record<ManualMatchError, string>;
}

interface ManualMatchFormProps {
  lang: string;
  seasons: ManualSeasonOption[];
  players: SelectablePlayer[];
  /** Present → the form edits this match instead of creating one. */
  initial: ManualMatchDetail | null;
  translations: ManualMatchFormTranslations;
}

interface PlayerRow {
  /** Stable across re-renders so React keys survive removals. */
  key: string;
  userId: string;
  full: string;
  clean: string;
  faults: string;
}

const DEFAULT_ROWS = 6;

const LABEL = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-4';
// Every field is label-on-top-of-a-36px-control, so cells line up across a row.
const FIELD = 'flex flex-col gap-1.5';
const CARD = 'rounded-2xl bg-surface p-4 sm:p-6 shadow-lift-lg';
const READONLY_VALUE = 'flex h-9 items-center justify-center rounded-lg bg-surface px-3 text-sm font-bold tabular-nums';

let rowCounter = 0;
function emptyRow(): PlayerRow {
  rowCounter += 1;
  return {
    key: `row-${rowCounter}`, userId: '', full: '', clean: '', faults: '',
  };
}

function toRows(initial: ManualMatchDetail | null): PlayerRow[] {
  if (!initial || initial.players.length === 0) {
    return Array.from({ length: DEFAULT_ROWS }, emptyRow);
  }
  return initial.players.map((p) => ({
    ...emptyRow(),
    userId: p.userId,
    full: String(p.full),
    clean: String(p.clean),
    faults: String(p.faults),
  }));
}

function toCount(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function ManualMatchForm({
  lang,
  seasons,
  players,
  initial,
  translations,
}: ManualMatchFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<ManualMatchError | null>(null);

  const [seasonId, setSeasonId] = useState<number>(initial?.seasonId ?? seasons[0]?.id ?? 0);
  const [leagueId, setLeagueId] = useState<number>(
    initial?.leagueId ?? seasons[0]?.leagues[0]?.leagueId ?? 0,
  );
  const [date, setDate] = useState(initial?.date ?? '');
  const [opponent, setOpponent] = useState(initial?.opponent ?? '');
  const [isHome, setIsHome] = useState(initial?.isHome ?? true);
  const [opponentTotal, setOpponentTotal] = useState(
    initial?.opponentTotalScore != null ? String(initial.opponentTotalScore) : '',
  );
  const [rows, setRows] = useState<PlayerRow[]>(() => toRows(initial));

  const leagues = useMemo(
    () => seasons.find((s) => s.id === seasonId)?.leagues ?? [],
    [seasons, seasonId],
  );

  const teamTotal = rows.reduce((sum, r) => sum + toCount(r.full) + toCount(r.clean), 0);

  const handleSeasonChange = (value: string) => {
    const nextSeasonId = Number(value);
    setSeasonId(nextSeasonId);
    // The previous competition belongs to the previous season's id space.
    const nextLeagues = seasons.find((s) => s.id === nextSeasonId)?.leagues ?? [];
    setLeagueId(nextLeagues[0]?.leagueId ?? 0);
  };

  const updateRow = (key: string, patch: Partial<PlayerRow>) => {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const removeRow = (key: string) => {
    setRows((current) => current.filter((r) => r.key !== key));
  };

  const handleSubmit = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveManualMatch({
        externalId: initial?.externalId,
        seasonId,
        leagueId,
        date,
        opponent,
        isHome,
        opponentTotalScore: opponentTotal.trim() === '' ? null : toCount(opponentTotal),
        // Rows left blank are just unused slots, not an error.
        players: rows
          .filter((r) => r.userId !== '')
          .map((r) => ({
            userId: r.userId,
            full: toCount(r.full),
            clean: toCount(r.clean),
            faults: toCount(r.faults),
          })),
      });

      if (result.success) {
        setError(null);
        if (initial) {
          router.push(`/${lang}/admin/matches`);
        } else {
          setRows(Array.from({ length: DEFAULT_ROWS }, emptyRow));
          setOpponent('');
          setOpponentTotal('');
          setDate('');
        }
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  const usedIds = new Set(rows.map((r) => r.userId).filter(Boolean));
  const seasonName = seasons.find((s) => s.id === seasonId)?.name ?? '';
  const leagueName = leagues.find((l) => l.leagueId === leagueId)?.name ?? '';

  return (
    <section className={CARD}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-bold text-lg sm:text-xl leading-tight">
          {initial ? translations.formTitleEdit : translations.formTitleCreate}
        </h2>
        {initial && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/${lang}/admin/matches`)}
            disabled={isPending}
          >
            {translations.cancelEdit}
          </Button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className={FIELD}>
          <span className={LABEL}>{translations.season}</span>
          <Select
            value={String(seasonId)}
            onValueChange={(value: string | null) => value && handleSeasonChange(value)}
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue>{seasonName}</SelectValue>
            </SelectTrigger>
            <SelectContent className="w-[var(--anchor-width)]">
              {seasons.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={FIELD}>
          <span className={LABEL}>{translations.competition}</span>
          <Select
            value={String(leagueId)}
            onValueChange={(value: string | null) => value && setLeagueId(Number(value))}
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue>{leagueName}</SelectValue>
            </SelectTrigger>
            <SelectContent className="w-[var(--anchor-width)]">
              {leagues.map((l) => (
                <SelectItem key={l.leagueId} value={String(l.leagueId)}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={FIELD}>
          <span className={LABEL}>{translations.date}</span>
          <DatePicker
            value={date}
            onValueChange={setDate}
            placeholder={translations.datePlaceholder}
            lang={lang}
            disabled={isPending}
          />
        </div>

        <label htmlFor="match-opponent" className={FIELD}>
          <span className={LABEL}>{translations.opponent}</span>
          <Input
            id="match-opponent"
            type="text"
            value={opponent}
            placeholder={translations.opponentPlaceholder}
            onChange={(e) => setOpponent(e.target.value)}
            disabled={isPending}
          />
        </label>

        <div className={FIELD}>
          <span className={LABEL}>{translations.venue}</span>
          <div className="flex items-center gap-1.5">
            {[
              { value: true, label: translations.home },
              { value: false, label: translations.away },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                disabled={isPending}
                onClick={() => setIsHome(option.value)}
                className={`inline-flex h-9 flex-1 items-center justify-center rounded-lg px-3 text-sm transition-colors hover:cursor-pointer disabled:cursor-not-allowed disabled:opacity-80 ${
                  isHome === option.value
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground font-medium'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <label htmlFor="match-opponent-total" className={FIELD}>
          <span className={LABEL}>
            {`${translations.opponentTotalScore} (${translations.optional})`}
          </span>
          <Input
            id="match-opponent-total"
            type="number"
            inputMode="numeric"
            min={0}
            value={opponentTotal}
            onChange={(e) => setOpponentTotal(e.target.value)}
            disabled={isPending}
            className="tabular-nums"
          />
        </label>
      </div>

      <div className="mt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-bold">{translations.players}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{translations.playersHint}</p>
          </div>
          <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 px-2 text-xs font-bold tabular-nums">
            {usedIds.size}
          </span>
        </div>

        <div className="mt-3 flex flex-col gap-3">
          {rows.map((row) => {
            const rowTotal = toCount(row.full) + toCount(row.clean);
            return (
              <div
                key={row.key}
                className="rounded-xl bg-surface-2 p-3 flex flex-col gap-3 sm:flex-row sm:items-end"
              >
                <div className={`${FIELD} sm:flex-1 sm:min-w-0`}>
                  <span className={LABEL}>{translations.player}</span>
                  <Select
                    value={row.userId || null}
                    onValueChange={(value: string | null) => updateRow(row.key, { userId: value ?? '' })}
                    disabled={isPending}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={translations.playerPlaceholder}>
                        {players.find((p) => p.id === row.userId)?.name
                          ?? translations.playerPlaceholder}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="w-[var(--anchor-width)]">
                      {players
                        .filter((p) => p.id === row.userId || !usedIds.has(p.id))
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-4 gap-2 sm:w-auto">
                  {([
                    { field: 'full' as const, label: translations.full },
                    { field: 'clean' as const, label: translations.clean },
                    { field: 'faults' as const, label: translations.faults },
                  ]).map(({ field, label }) => (
                    <label key={field} htmlFor={`${row.key}-${field}`} className={FIELD}>
                      <span className={LABEL}>{label}</span>
                      <Input
                        id={`${row.key}-${field}`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={row[field]}
                        onChange={(e) => updateRow(row.key, { [field]: e.target.value })}
                        disabled={isPending}
                        className="sm:w-20 text-center tabular-nums"
                      />
                    </label>
                  ))}

                  <div className={FIELD}>
                    <span className={LABEL}>{translations.total}</span>
                    <span className={`${READONLY_VALUE} sm:w-20`}>{rowTotal}</span>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon-lg"
                  aria-label={translations.removePlayer}
                  onClick={() => removeRow(row.key)}
                  disabled={isPending}
                  className="self-end"
                >
                  <X />
                </Button>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRows((current) => [...current, emptyRow()])}
            disabled={isPending}
          >
            <Plus />
            {translations.addPlayer}
          </Button>
          <p className="text-sm">
            <span className="text-muted-foreground">{`${translations.teamTotal}: `}</span>
            <span className="font-bold tabular-nums">{teamTotal}</span>
          </p>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive">
          {translations.errors[error]}
        </p>
      )}

      <div className="mt-4">
        <Button onClick={handleSubmit} disabled={isPending} size="lg" className="w-full sm:w-auto">
          {isPending ? <Loader2 className="animate-spin" /> : <Save />}
          {isPending ? translations.saving : translations.save}
        </Button>
      </div>
    </section>
  );
}
