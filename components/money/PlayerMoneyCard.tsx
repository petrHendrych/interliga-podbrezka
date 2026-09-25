import type { ReactNode } from 'react';
import type { MatchMoneyActionError } from '@/lib/match-money-actions';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { PaidToggle, type PaidToggleLabels } from './PaidToggle';

export interface PlayerMoneyCardLabels extends PaidToggleLabels {
  total: string;
  faults: string;
  fine: string;
  bonus: string;
}

export type PlayerMoneyRow = 'fine' | 'bonus';

export interface PlayerMoneyCardPlayer {
  user_id: string;
  user_name: string;
  external_player_id?: number | null;
  total: number;
  faults: number;
  calculated_fine: number;
  streak_fine: number;
  bonus_received: number;
  is_paid: boolean;
  is_bonus_paid: boolean;
}

export interface PlayerMoneyCardProps {
  matchId: number;
  player: PlayerMoneyCardPlayer;
  labels: PlayerMoneyCardLabels;
  errors: Record<MatchMoneyActionError, string>;
  rows?: ReadonlyArray<PlayerMoneyRow>;
}

const ALL_ROWS: ReadonlyArray<PlayerMoneyRow> = ['fine', 'bonus'];

const CARD = 'flex flex-col gap-3 rounded-xl bg-surface-2 p-4';
const HEADER = 'flex items-center gap-3 min-w-0';
const AVATAR = 'size-12 shrink-0 rounded-xl after:rounded-xl';
const STAT_TILE = 'rounded-lg bg-surface px-2 py-1 text-center min-w-14';
const STAT_LABEL = 'block text-[10px] leading-tight uppercase font-semibold tracking-wide text-muted-foreground';
const STAT_VALUE = 'text-sm leading-tight font-semibold tabular-nums';
const AMOUNT_ROW = 'flex items-center justify-between gap-3 border-t border-foreground/10 pt-3';
const AMOUNT_LABEL = 'text-xs text-muted-foreground';
const AMOUNT = 'text-base tabular-nums';

function amountClass(amount: number, isPaid: boolean): string {
  if (amount <= 0) return 'text-muted-foreground font-normal';
  return isPaid
    ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
    : 'text-red-600 dark:text-red-400 font-semibold';
}

interface AmountRowProps {
  label: string;
  amount: number;
  isPaid: boolean;
  toggle: ReactNode;
}

function AmountRow({
  label, amount, isPaid, toggle,
}: AmountRowProps) {
  return (
    <div className={AMOUNT_ROW}>
      <div className="flex flex-col">
        <span className={AMOUNT_LABEL}>{label}</span>
        <span className={`${AMOUNT} ${amountClass(amount, isPaid)}`}>{`${amount} €`}</span>
      </div>
      {toggle}
    </div>
  );
}

export function PlayerMoneyCard({
  matchId, player, labels, errors, rows = ALL_ROWS,
}: PlayerMoneyCardProps) {
  const showFine = rows.includes('fine');
  const showBonus = rows.includes('bonus');
  const fine = player.calculated_fine + player.streak_fine;
  const toggleLabels: PaidToggleLabels = {
    paid: labels.paid,
    unpaid: labels.unpaid,
    markPaid: labels.markPaid,
    markUnpaid: labels.markUnpaid,
  };

  return (
    <div className={CARD}>
      <div className={HEADER}>
        <PlayerAvatar
          name={player.user_name}
          externalPlayerId={player.external_player_id}
          className={AVATAR}
          fallbackClassName="text-sm"
        />
        <span className="min-w-0 flex-1 truncate font-bold leading-tight">{player.user_name}</span>
        <div className="flex shrink-0 gap-1.5">
          <div className={STAT_TILE}>
            <span className={STAT_LABEL}>{labels.total}</span>
            <span className={STAT_VALUE}>{player.total}</span>
          </div>
          {showFine && (
            <div className={STAT_TILE}>
              <span className={STAT_LABEL}>{labels.faults}</span>
              <span className={STAT_VALUE}>{player.faults}</span>
            </div>
          )}
        </div>
      </div>

      {showFine && (
        <AmountRow
          label={labels.fine}
          amount={fine}
          isPaid={player.is_paid}
          toggle={fine > 0 && (
            <PaidToggle
              matchId={matchId}
              target={{ kind: 'fine', userId: player.user_id }}
              isPaid={player.is_paid}
              labels={toggleLabels}
              errors={errors}
            />
          )}
        />
      )}

      {showBonus && (
        <AmountRow
          label={labels.bonus}
          amount={player.bonus_received}
          isPaid={player.is_bonus_paid}
          toggle={player.bonus_received > 0 && (
            <PaidToggle
              matchId={matchId}
              target={{ kind: 'bonus', userId: player.user_id }}
              isPaid={player.is_bonus_paid}
              labels={toggleLabels}
              errors={errors}
            />
          )}
        />
      )}
    </div>
  );
}
