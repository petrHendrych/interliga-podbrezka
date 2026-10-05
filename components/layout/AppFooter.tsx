import { interpolate } from '@/lib/i18n/config';

export function AppFooter({ label }: { label: string }) {
  return (
    <footer className="px-4 pt-6 pb-[calc(0.75rem+var(--app-safe-bottom))] text-center text-xs text-muted-foreground">
      {interpolate(label, { version: process.env.APP_VERSION ?? '' })}
    </footer>
  );
}
