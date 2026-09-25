import type { MatchMoneyActionError } from '@/lib/match-money-actions';
import type { TrainerConditionType } from '@/lib/money-rules';
import { PaidToggle, type PaidToggleLabels } from './PaidToggle';

export interface TrainerPaymentCardPayment {
  id: number;
  userName: string;
  conditionType: string;
  amount: number;
  isPaid: boolean;
}

export interface TrainerPaymentCardProps {
  matchId: number;
  payment: TrainerPaymentCardPayment;
  labels: PaidToggleLabels;
  conditions: Record<TrainerConditionType, string>;
  errors: Record<MatchMoneyActionError, string>;
}

const CARD = 'flex items-center justify-between gap-3 rounded-xl bg-surface-2 p-4';

function isConditionType(
  value: string,
  conditions: Record<TrainerConditionType, string>,
): value is TrainerConditionType {
  return value in conditions;
}

export function TrainerPaymentCard({
  matchId, payment, labels, conditions, errors,
}: TrainerPaymentCardProps) {
  const condition = isConditionType(payment.conditionType, conditions)
    ? conditions[payment.conditionType]
    : payment.conditionType;
  const amountClass = payment.isPaid
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-red-600 dark:text-red-400';

  return (
    <div className={CARD}>
      <div className="flex min-w-0 flex-col">
        <span className="font-semibold leading-tight">{payment.userName}</span>
        <span className="text-xs text-muted-foreground">{condition}</span>
        <span className={`font-semibold tabular-nums ${amountClass}`}>{`${payment.amount} €`}</span>
      </div>
      <PaidToggle
        matchId={matchId}
        target={{ kind: 'trainer', paymentId: payment.id }}
        isPaid={payment.isPaid}
        labels={labels}
        errors={errors}
      />
    </div>
  );
}
