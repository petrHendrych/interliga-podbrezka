export interface RuleItem {
  title: string;
  amount: string;
  note: string;
}

interface RuleListProps {
  label: string;
  tone: 'fine' | 'bonus';
  items: readonly RuleItem[];
}

const TONE_TEXT = {
  fine: 'text-red-600 dark:text-red-400',
  bonus: 'text-emerald-600 dark:text-emerald-400',
} as const;

const TONE_DOT = {
  fine: 'bg-red-600 dark:bg-red-400',
  bonus: 'bg-emerald-600 dark:bg-emerald-400',
} as const;

const AMOUNT_PILL = 'inline-flex shrink-0 items-center rounded-full bg-surface px-2.5 py-1 text-xs font-bold tabular-nums';

export function RuleList({ label, tone, items }: RuleListProps) {
  return (
    <section className="space-y-2">
      <h3 className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest ${TONE_TEXT[tone]}`}>
        <span className={`size-1.5 rounded-full ${TONE_DOT[tone]}`} />
        {label}
      </h3>
      <ul className="divide-y divide-border rounded-xl bg-surface-2 px-4">
        {items.map((item) => (
          <li key={item.title} className="py-3">
            <div className="flex items-start justify-between gap-3">
              <span className="font-medium leading-snug">{item.title}</span>
              <span className={AMOUNT_PILL}>{item.amount}</span>
            </div>
            {item.note && (
              <p className="mt-1 text-sm text-muted-foreground leading-snug">{item.note}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
