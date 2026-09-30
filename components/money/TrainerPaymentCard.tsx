import type { MatchMoneyActionError } from '@/lib/match-money-actions';
import type { TrainerConditionType } from '@/lib/money-rules';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { OWN_CARD_RING, OwnBadge } from './OwnBadge';
import { PaidStatusPill, PaidToggle, type PaidToggleLabels } from './PaidToggle';

export interface TrainerPaymentCardPayment {
  id: number;
  userId: string;
  userName: string;
  conditionType: string;
  amount: number;
  isPaid: boolean;
}

export interface TrainerPaymentCardLabels extends PaidToggleLabels {
  you: string;
}

export interface TrainerPaymentCardProps {
  matchId: number;
  payment: TrainerPaymentCardPayment;
  labels: TrainerPaymentCardLabels;
  conditions: Record<TrainerConditionType, string>;
  errors: Record<MatchMoneyActionError, string>;
  canEdit?: boolean;
  isOwn?: boolean;
}

const CARD = 'flex flex-col gap-3 rounded-xl bg-surface-2 p-4';
const HEADER = 'flex items-center gap-3 min-w-0';
const AVATAR = 'size-12 shrink-0 rounded-xl after:rounded-xl';
const AMOUNT_ROW = 'flex items-center justify-between gap-3 border-t border-foreground/10 pt-3';

function isConditionType(
  value: string,
  conditions: Record<TrainerConditionType, string>,
): value is TrainerConditionType {
  return value in conditions;
}

export function TrainerPaymentCard({
  matchId, payment, labels, conditions, errors, canEdit = true, isOwn = false,
}: TrainerPaymentCardProps) {
  const condition = isConditionType(payment.conditionType, conditions)
    ? conditions[payment.conditionType]
    : payment.conditionType;
  const amountClass = payment.isPaid
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-red-600 dark:text-red-400';

  return (
    <div className={isOwn ? `${CARD} ${OWN_CARD_RING}` : CARD}>
      {isOwn && <OwnBadge label={labels.you} />}
      <div className={HEADER}>
        <PlayerAvatar
          name={payment.userName}
          userId={payment.userId}
          className={AVATAR}
          fallbackClassName="text-sm"
        />
        <div className="min-w-0 flex-1">
          <span className="block truncate font-bold leading-tight">{payment.userName}</span>
          <span className="block truncate text-xs text-muted-foreground">{condition}</span>
        </div>
      </div>

      <div className={AMOUNT_ROW}>
        <span className={`text-base font-semibold tabular-nums ${amountClass}`}>{`${payment.amount} €`}</span>
        {canEdit ? (
          <PaidToggle
            matchId={matchId}
            target={{ kind: 'trainer', paymentId: payment.id }}
            isPaid={payment.isPaid}
            labels={labels}
            errors={errors}
          />
        ) : (
          <PaidStatusPill isPaid={payment.isPaid} labels={labels} />
        )}
      </div>
    </div>
  );
}
