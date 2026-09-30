export const OWN_CARD_RING = 'relative ring-2 ring-primary';

/**
 * Sits on the ring line and hides it behind the text. The card straddles two surfaces (the
 * section above the line, the card below it), so the background is split at the line itself.
 */
export function OwnBadge({ label }: { label: string }) {
  return (
    <span className="absolute -top-[9px] left-4 bg-[linear-gradient(to_bottom,var(--surface)_50%,var(--surface-2)_50%)] px-1.5 text-[11px] font-semibold leading-4 text-primary">
      {label}
    </span>
  );
}
