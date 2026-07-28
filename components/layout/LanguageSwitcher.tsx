'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LANGUAGES, changeLanguage } from '@/lib/i18n/languages';

export function LanguageSwitcher({
  lang,
  translations,
}: {
  lang: string;
  translations: {
    switchLanguage: string;
  };
}) {
  const pathname = usePathname();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-lg" />}>
        <Languages className="size-[1.2rem]" />
        <span className="sr-only">{translations.switchLanguage}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LANGUAGES.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => changeLanguage(l.code, lang, pathname)}
            className="gap-2 cursor-pointer"
          >
            <l.Flag className="h-3 w-4 shrink-0" />
            <span>{l.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
