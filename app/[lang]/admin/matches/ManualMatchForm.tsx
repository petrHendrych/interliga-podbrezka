'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRightLeft, Loader2, Save, X,
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
import { interpolate } from '@/lib/i18n/config';
import { SUBSTITUTION_FIRST_SEASON_ID, THROWS_PER_GAME } from '@/lib/substitutions';
import {
  MAX_MATCH_POINTS,
  MAX_SUBSTITUTIONS,
  MIN_SUBSTITUTION_THROW,
  POSITION_COUNT,
} from '@/lib/validation/manual-match';

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
  teamMatchPoints: string;
  opponentMatchPoints: string;
  optional: string;
  players: string;
  playersHint: string;
  playerPlaceholder: string;
  full: string;
  clean: string;
  total: string;
  faults: string;
  /** `{n}`: the position's number. */
  position: string;
  addSubstitution: string;
  substitute: string;
  fromThrow: string;
  fromThrowHint: string;
  removeSubstitution: string;
  positionTotal: string;
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

interface PlayerFields {
  /** Stable across re-renders so React keys survive removals. */
  key: string;
  userId: string;
  full: string;
  clean: string;
  faults: string;
}

interface SubstituteFields extends PlayerFields {
  fromThrow: string;
}

interface PositionCard {
  key: string;
  starter: PlayerFields;
  /** In order: each one replaces the player before it. */
  substitutions: SubstituteFields[];
}

const LABEL = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-4';
// Every field is label-on-top-of-a-36px-control, so cells line up across a row.
const FIELD = 'flex flex-col gap-1.5';
const CARD = 'rounded-2xl bg-surface p-4 sm:p-6 shadow-lift-lg';
const READONLY_VALUE = 'flex h-9 items-center justify-center rounded-lg bg-surface px-3 text-sm font-bold tabular-nums';

let rowCounter = 0;
function nextKey(): string {
  rowCounter += 1;
  return `row-${rowCounter}`;
}

function emptyFields(): PlayerFields {
  return {
    key: nextKey(), userId: '', full: '', clean: '', faults: '',
  };
}

function emptyCard(): PositionCard {
  return { key: nextKey(), starter: emptyFields(), substitutions: [] };
}

function emptyCards(): PositionCard[] {
  return Array.from({ length: POSITION_COUNT }, emptyCard);
}

function toFields(player: {
  userId: string; full: number; clean: number; faults: number;
}): PlayerFields {
  return {
    key: nextKey(),
    userId: player.userId,
    full: String(player.full),
    clean: String(player.clean),
    faults: String(player.faults),
  };
}

function toCards(initial: ManualMatchDetail | null): PositionCard[] {
  if (!initial || initial.positions.length === 0) return emptyCards();
  const cards = initial.positions.map((p) => ({
    key: nextKey(),
    starter: toFields(p.starter),
    substitutions: p.substitutions.map((s) => ({
      ...toFields(s), fromThrow: String(s.fromThrow),
    })),
  }));
  return [
    ...cards,
    ...Array.from({ length: Math.max(POSITION_COUNT - cards.length, 0) }, emptyCard),
  ];
}

function toCount(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Unlike `toCount`, keeps the half point and leaves an empty field empty. */
function toPoints(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

function fromPoints(value: number | null | undefined): string {
  return value != null ? String(value) : '';
}

function fieldsTotal(fields: PlayerFields): number {
  return toCount(fields.full) + toCount(fields.clean);
}

function cardTotal(card: PositionCard): number {
  return [card.starter, ...card.substitutions].reduce((sum, f) => sum + fieldsTotal(f), 0);
}

function toPlayerInput(fields: PlayerFields) {
  return {
    userId: fields.userId,
    full: toCount(fields.full),
    clean: toCount(fields.clean),
    faults: toCount(fields.faults),
  };
}

interface PlayerFieldsRowProps {
  fields: PlayerFields;
  playerLabel: string;
  /** Everyone else's pick, so nobody is entered twice. */
  takenIds: Set<string>;
  players: SelectablePlayer[];
  translations: ManualMatchFormTranslations;
  disabled: boolean;
  onChange: (patch: Partial<PlayerFields>) => void;
}

function PlayerFieldsRow({
  fields, playerLabel, takenIds, players, translations, disabled, onChange,
}: PlayerFieldsRowProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className={`${FIELD} sm:flex-1 sm:min-w-0`}>
        <span className={LABEL}>{playerLabel}</span>
        <Select
          value={fields.userId || null}
          onValueChange={(value: string | null) => onChange({ userId: value ?? '' })}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder={translations.playerPlaceholder}>
              {players.find((p) => p.id === fields.userId)?.name
                ?? translations.playerPlaceholder}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="w-[var(--anchor-width)]">
            {players
              .filter((p) => p.id === fields.userId || !takenIds.has(p.id))
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
          <label key={field} htmlFor={`${fields.key}-${field}`} className={FIELD}>
            <span className={LABEL}>{label}</span>
            <Input
              id={`${fields.key}-${field}`}
              type="number"
              inputMode="numeric"
              min={0}
              value={fields[field]}
              onChange={(e) => onChange({ [field]: e.target.value })}
              disabled={disabled}
              className="sm:w-20 text-center tabular-nums"
            />
          </label>
        ))}

        <div className={FIELD}>
          <span className={LABEL}>{translations.total}</span>
          <span className={`${READONLY_VALUE} sm:w-20`}>{fieldsTotal(fields)}</span>
        </div>
      </div>
    </div>
  );
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
  const [teamPoints, setTeamPoints] = useState(fromPoints(initial?.teamMatchPoints));
  const [opponentPoints, setOpponentPoints] = useState(fromPoints(initial?.opponentMatchPoints));
  const [cards, setCards] = useState<PositionCard[]>(() => toCards(initial));

  const leagues = useMemo(
    () => seasons.find((s) => s.id === seasonId)?.leagues ?? [],
    [seasons, seasonId],
  );

  const teamTotal = cards.reduce((sum, c) => sum + cardTotal(c), 0);
  const substitutionCount = cards.reduce((sum, c) => sum + c.substitutions.length, 0);
  const canSubstitute = seasonId >= SUBSTITUTION_FIRST_SEASON_ID
    && substitutionCount < MAX_SUBSTITUTIONS;

  const handleSeasonChange = (value: string) => {
    const nextSeasonId = Number(value);
    setSeasonId(nextSeasonId);
    // The previous competition belongs to the previous season's id space.
    const nextLeagues = seasons.find((s) => s.id === nextSeasonId)?.leagues ?? [];
    setLeagueId(nextLeagues[0]?.leagueId ?? 0);
    if (nextSeasonId < SUBSTITUTION_FIRST_SEASON_ID) {
      setCards((current) => current.map((c) => ({ ...c, substitutions: [] })));
    }
  };

  const updateCard = (key: string, update: (card: PositionCard) => PositionCard) => {
    setCards((current) => current.map((c) => (c.key === key ? update(c) : c)));
  };

  const updateStarter = (cardKey: string, patch: Partial<PlayerFields>) => {
    updateCard(cardKey, (c) => ({ ...c, starter: { ...c.starter, ...patch } }));
  };

  const updateSubstitute = (cardKey: string, subKey: string, patch: Partial<SubstituteFields>) => {
    updateCard(cardKey, (c) => ({
      ...c,
      substitutions: c.substitutions.map((s) => (s.key === subKey ? { ...s, ...patch } : s)),
    }));
  };

  const addSubstitute = (cardKey: string) => {
    updateCard(cardKey, (c) => ({
      ...c,
      substitutions: [...c.substitutions, { ...emptyFields(), fromThrow: '' }],
    }));
  };

  // The next substitute replaced this one, so they go together.
  const removeSubstitute = (cardKey: string, index: number) => {
    updateCard(cardKey, (c) => ({ ...c, substitutions: c.substitutions.slice(0, index) }));
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
        teamMatchPoints: toPoints(teamPoints),
        opponentMatchPoints: toPoints(opponentPoints),
        positions: cards.map((c) => ({
          starter: toPlayerInput(c.starter),
          substitutions: c.substitutions.map((s) => ({
            ...toPlayerInput(s),
            fromThrow: toCount(s.fromThrow),
          })),
        })),
      });

      if (result.success) {
        setError(null);
        if (initial) {
          router.push(`/${lang}/admin/matches`);
        } else {
          setCards(emptyCards());
          setOpponent('');
          setOpponentTotal('');
          setTeamPoints('');
          setOpponentPoints('');
          setDate('');
        }
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  const usedIds = new Set(cards
    .flatMap((c) => [c.starter, ...c.substitutions])
    .map((f) => f.userId)
    .filter(Boolean));
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

        {[
          {
            id: 'match-team-points',
            label: translations.teamMatchPoints,
            value: teamPoints,
            onChange: setTeamPoints,
          },
          {
            id: 'match-opponent-points',
            label: translations.opponentMatchPoints,
            value: opponentPoints,
            onChange: setOpponentPoints,
          },
        ].map((field) => (
          <label key={field.id} htmlFor={field.id} className={FIELD}>
            <span className={LABEL}>{`${field.label} (${translations.optional})`}</span>
            <Input
              id={field.id}
              type="number"
              inputMode="decimal"
              min={0}
              max={MAX_MATCH_POINTS}
              step={0.5}
              value={field.value}
              onChange={(e) => field.onChange(e.target.value)}
              disabled={isPending}
              className="tabular-nums"
            />
          </label>
        ))}
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
          {cards.map((card, cardIndex) => {
            const showAdd = canSubstitute && card.substitutions.length < MAX_SUBSTITUTIONS;
            const hasSubstitutions = card.substitutions.length > 0;
            return (
              <section
                key={card.key}
                aria-label={interpolate(translations.position, { n: cardIndex + 1 })}
                className="rounded-xl bg-surface-2 p-3 flex flex-col gap-3"
              >
                <PlayerFieldsRow
                  fields={card.starter}
                  playerLabel={interpolate(translations.position, { n: cardIndex + 1 })}
                  takenIds={usedIds}
                  players={players}
                  translations={translations}
                  disabled={isPending}
                  onChange={(patch) => updateStarter(card.key, patch)}
                />

                {card.substitutions.map((sub, subIndex) => (
                  <div key={sub.key} className="flex flex-col gap-3 border-l-2 border-primary/40 pl-3">
                    <div className="flex items-end justify-between gap-3">
                      <div className={FIELD}>
                        <label htmlFor={`${sub.key}-fromThrow`} className={LABEL}>
                          {translations.fromThrow}
                        </label>
                        <Input
                          id={`${sub.key}-fromThrow`}
                          type="number"
                          inputMode="numeric"
                          min={MIN_SUBSTITUTION_THROW}
                          max={THROWS_PER_GAME}
                          value={sub.fromThrow}
                          onChange={(e) => updateSubstitute(
                            card.key,
                            sub.key,
                            { fromThrow: e.target.value },
                          )}
                          aria-describedby={`${sub.key}-fromThrowHint`}
                          disabled={isPending}
                          className="w-24 text-center tabular-nums"
                        />
                        <span id={`${sub.key}-fromThrowHint`} className="text-xs text-muted-foreground">
                          {translations.fromThrowHint}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        aria-label={translations.removeSubstitution}
                        onClick={() => removeSubstitute(card.key, subIndex)}
                        disabled={isPending}
                      >
                        <X />
                      </Button>
                    </div>

                    <PlayerFieldsRow
                      fields={sub}
                      playerLabel={translations.substitute}
                      takenIds={usedIds}
                      players={players}
                      translations={translations}
                      disabled={isPending}
                      onChange={(patch) => updateSubstitute(card.key, sub.key, patch)}
                    />
                  </div>
                ))}

                {(showAdd || hasSubstitutions) && (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {showAdd ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addSubstitute(card.key)}
                        disabled={isPending}
                      >
                        <ArrowRightLeft />
                        {translations.addSubstitution}
                      </Button>
                    ) : <span />}
                    {hasSubstitutions && (
                      <p className="text-sm">
                        <span className="text-muted-foreground">{`${translations.positionTotal}: `}</span>
                        <span className="font-bold tabular-nums">{cardTotal(card)}</span>
                      </p>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
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
