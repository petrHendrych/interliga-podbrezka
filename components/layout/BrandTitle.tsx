import { cn } from '@/lib/utils';

/**
 * Rules are positioned off the text baseline rather than the box bottom. An
 * absolutely positioned child of a `relative` inline parent resolves against the
 * font-derived inline box, so `0.24em` — Montserrat's descent — puts `bottom` on
 * the baseline and holds at both breakpoints without a per-size value.
 */
const RULE = 'pointer-events-none absolute h-px rounded-full';
/** Upper step: sits on the baseline, kept clear of the text. */
const RULE_HIGH = 'bottom-[0.24em] w-10';
/** Lower step: 2px under the upper one, overhanging further and running inward. */
const RULE_LOW = 'bottom-[calc(0.24em-3px)] w-[calc(4rem+3ch+0.3em)]';
/**
 * Full strength at the outer end, gone by the midpoint, so each rule dissolves
 * as it approaches the wordmark. `decor-dot` is themed, so the fade is the red of
 * the background dots in light mode and their blue-grey in dark.
 */
const FADE_INWARD_FROM_LEFT = 'bg-linear-to-r from-decor-dot/80 to-transparent to-50%';
const FADE_INWARD_FROM_RIGHT = 'bg-linear-to-l from-decor-dot/80 to-transparent to-50%';

/**
 * The wordmark, flanked by two stepped rules at each end — a short one on the
 * baseline and a longer one below it — that overhang the text box and fade out
 * towards the letters. The rules only appear once the wordmark is centred
 * (`md` and up); on mobile it sits against the left edge, where an inward
 * overhang has no room to breathe.
 */
export function BrandTitle({ className }: { className?: string }) {
  return (
    <span className={cn('relative font-bold uppercase', className)}>
      Interliga Podbrezová
      <span aria-hidden className={cn(RULE, RULE_LOW, FADE_INWARD_FROM_LEFT, '-left-8 hidden md:block')} />
      <span aria-hidden className={cn(RULE, RULE_LOW, FADE_INWARD_FROM_RIGHT, '-right-8 hidden md:block')} />
      <span aria-hidden className={cn(RULE, RULE_HIGH, FADE_INWARD_FROM_LEFT, '-left-5 hidden md:block')} />
      <span aria-hidden className={cn(RULE, RULE_HIGH, FADE_INWARD_FROM_RIGHT, '-right-5 hidden md:block')} />
    </span>
  );
}
