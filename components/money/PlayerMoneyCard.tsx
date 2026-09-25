import type { MatchMoneyActionError } from '@/lib/match-money-actions';
import { PaidToggle, type PaidToggleLabels } from './PaidToggle';

export interface PlayerMoneyCardLabels extends PaidToggleLabels {
  total: string;
  faults: string;
  fine: string;
  bonus: string;
}

export interface PlayerMoneyCardPlayer {
  user_id: string;
  user_name: string;
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
}

const CARD = 'flex flex-col gap-3 rounded-xl bg-surface-2 p-4';
const STAT_LABEL = 'text-xs text-muted-foreground';
const AMOUNT_ROW = 'flex items-center justify-between gap-3';

function amountClass(amount: number, isPaid: boolean): string {
  if (amount <= 0) return 'text-muted-foreground font-normal';
  return isPaid
    ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
    : 'text-red-600 dark:text-red-400 font-semibold';
}

export function PlayerMoneyCard({
  matchId, player, labels, errors,
}: PlayerMoneyCardProps) {
  const fine = player.calculated_fine + player.streak_fine;
  const toggleLabels: PaidToggleLabels = {
    paid: labels.paid,
    unpaid: labels.unpaid,
    markPaid: labels.markPaid,
    markUnpaid: labels.markUnpaid,
  };

  return (
    <div className={CARD}>
      <div className="flex items-start justify-between gap-3">
        <span className="font-semibold leading-tight">{player.user_name}</span>
        <dl className="flex shrink-0 gap-4 text-right tabular-nums">
          <div>
            <dt className={STAT_LABEL}>{labels.total}</dt>
            <dd className="font-semibold">{player.total}</dd>
          </div>
          <div>
            <dt className={STAT_LABEL}>{labels.faults}</dt>
            <dd className="font-semibold">{player.faults}</dd>
          </div>
        </dl>
      </div>

      <div className={AMOUNT_ROW}>
        <div className="flex flex-col">
          <span className={STAT_LABEL}>{labels.fine}</span>
          <span className={`tabular-nums ${amountClass(fine, player.is_paid)}`}>{`${fine} €`}</span>
        </div>
        {fine > 0 && (
          <PaidToggle
            matchId={matchId}
            target={{ kind: 'fine', userId: player.user_id }}
            isPaid={player.is_paid}
            labels={toggleLabels}
            errors={errors}
          />
        )}
      </div>

      <div className={AMOUNT_ROW}>
        <div className="flex flex-col">
          <span className={STAT_LABEL}>{labels.bonus}</span>
          <span className={`tabular-nums ${amountClass(player.bonus_received, player.is_bonus_paid)}`}>
            {`${player.bonus_received} €`}
          </span>
        </div>
        {player.bonus_received > 0 && (
          <PaidToggle
            matchId={matchId}
            target={{ kind: 'bonus', userId: player.user_id }}
            isPaid={player.is_bonus_paid}
            labels={toggleLabels}
            errors={errors}
          />
        )}
      </div>
    </div>
  );
}
