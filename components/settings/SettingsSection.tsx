import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface SettingsSectionProps {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
}

export function SettingsSection({
  icon: Icon, title, description, children,
}: SettingsSectionProps) {
  return (
    <section className="rounded-2xl bg-surface p-4 sm:p-6 shadow-lift-lg">
      <div className="flex items-start gap-3 border-b border-foreground/10 pb-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-bold text-lg sm:text-xl leading-tight">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="pt-4">{children}</div>
    </section>
  );
}
