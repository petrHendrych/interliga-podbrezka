'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Languages } from 'lucide-react';
import {
  SK, CZ, HU, RS,
} from 'country-flag-icons/react/3x2';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const languages = [
  { code: 'sk', name: 'Slovenčina', Flag: SK },
  { code: 'cs', name: 'Čeština', Flag: CZ },
  { code: 'hu', name: 'Magyar', Flag: HU },
  { code: 'sr', name: 'Srpski', Flag: RS },
];

export function LanguageSwitcher({ lang }: { lang: string }) {
  const pathname = usePathname();

  const handleLanguageChange = (newLang: string) => {
    if (newLang === lang) return;

    // Update localStorage
    localStorage.setItem('next-locale', newLang);

    // Set cookie for proxy.ts
    // Expire in 1 year
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);
    document.cookie = `next-locale=${newLang}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;

    // Redirect to the new locale
    const segments = pathname.split('/');
    if (segments.length > 1) {
      segments[1] = newLang;
      window.location.href = segments.join('/');
    } else {
      window.location.href = `/${newLang}`;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-lg" />}>
        <Languages className="size-[1.2rem]" />
        <span className="sr-only">Switch language</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {languages.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => handleLanguageChange(l.code)}
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
