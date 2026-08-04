'use client';

import * as React from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { CalendarIcon } from 'lucide-react';
import {
  cs, hu, sk, srLatn,
} from 'date-fns/locale';
import type { Locale as DateFnsLocale } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

const DATE_FNS_LOCALES: Record<string, DateFnsLocale> = {
  sk, cs, hu, sr: srLatn,
};

/** `YYYY-MM-DD` in local time, so the day never shifts across a timezone. */
function toIsoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function fromIsoDay(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

interface DatePickerProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  lang: string;
  disabled?: boolean;
  className?: string;
}

export function DatePicker({
  value,
  onValueChange,
  placeholder,
  lang,
  disabled,
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = fromIsoDay(value);

  // Bounds the year dropdown; matches are never entered outside this window.
  const currentYear = new Date().getFullYear();
  const startMonth = new Date(currentYear - 5, 0);
  const endMonth = new Date(currentYear + 1, 11);

  const label = selected
    ? new Intl.DateTimeFormat(lang, {
      year: 'numeric', month: 'long', day: 'numeric',
    }).format(selected)
    : placeholder;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        disabled={disabled}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-1.5 text-sm shadow-xs transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer',
          selected ? 'font-semibold' : 'font-normal text-muted-foreground',
          className,
        )}
      >
        <span className="truncate">{label}</span>
        <CalendarIcon className="size-4 shrink-0 opacity-50" />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner side="bottom" align="start" sideOffset={4} className="z-50">
          <PopoverPrimitive.Popup className="z-50 rounded-lg border bg-popover p-0 text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95">
            <Calendar
              mode="single"
              selected={selected}
              defaultMonth={selected}
              locale={DATE_FNS_LOCALES[lang] ?? sk}
              captionLayout="dropdown"
              startMonth={startMonth}
              endMonth={endMonth}
              autoFocus
              onSelect={(date) => {
                if (!date) return;
                onValueChange(toIsoDay(date));
                setOpen(false);
              }}
            />
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
