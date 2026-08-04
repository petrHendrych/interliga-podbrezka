'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Menu, X, Sun, Moon, Languages, Users, RefreshCw, LogOut, ChevronDown, Check,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { signOut } from '@/lib/auth-actions';
import { Locale } from '@/lib/i18n/config';
import { LANGUAGES, changeLanguage } from '@/lib/i18n/languages';
import { useSyncData } from '@/lib/hooks/useSyncData';

interface MobileNavProps {
  user?: {
    id: string;
    name: string;
    role: string;
  } | null;
  lang: Locale;
  translations: {
    manageUsers: string;
    syncData: string;
    syncing: string;
    logout: string;
    toggleTheme: string;
  };
}

export function MobileNav({
  user,
  lang,
  translations,
}: MobileNavProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLangOpen, setIsLangOpen] = React.useState(false);
  const { isSyncing, handleSync } = useSyncData();
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    setIsOpen(false);
    setIsLangOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const currentLangObj = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];

  return (
    <div className="md:hidden relative w-full">
      <div className="flex h-16 items-center justify-between px-4">
        <Link href={`/${lang}`} className="flex items-center">
          <span className="font-bold text-base sm:text-lg uppercase tracking-wider">
            Interliga Podbrezová
          </span>
        </Link>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Toggle menu"
          className="h-10 w-10"
        >
          {isOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </Button>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 border-b bg-background shadow-xl p-4 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 z-50">
          {user && (
            <>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col px-1 py-1">
                  <span className="text-sm font-semibold">{user.name}</span>
                  <span className="text-xs text-muted-foreground capitalize">{user.role}</span>
                </div>

                {user.role === 'admin' && (
                  <div className="flex flex-col gap-2">
                    <Link
                      href={`/${lang}/admin/users`}
                      className="flex items-center gap-2.5 p-2.5 text-sm rounded-lg border hover:bg-accent transition-colors font-medium"
                    >
                      <Users className="size-4 text-muted-foreground" />
                      <span>{translations.manageUsers}</span>
                    </Link>

                    <button
                      type="button"
                      onClick={handleSync}
                      disabled={isSyncing}
                      className="flex items-center gap-2.5 p-2.5 text-sm rounded-lg border hover:bg-accent transition-colors font-medium text-left w-full disabled:opacity-50"
                    >
                      <RefreshCw className={`size-4 text-muted-foreground ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>{isSyncing ? translations.syncing : translations.syncData}</span>
                    </button>
                  </div>
                )}
              </div>
              <Separator />
            </>
          )}

          <div className="flex flex-col gap-3">
            <div className="flex flex-col border rounded-lg overflow-hidden bg-card/50">
              <button
                type="button"
                onClick={() => setIsLangOpen(!isLangOpen)}
                className="flex items-center justify-between p-3 text-sm font-medium text-left hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Languages className="size-4 text-muted-foreground" />
                  <currentLangObj.Flag className="h-3.5 w-5 shrink-0 rounded-sm" />
                  <span>{currentLangObj.name}</span>
                </div>
                <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-200 ${isLangOpen ? 'rotate-180' : ''}`} />
              </button>

              {isLangOpen && (
                <div className="flex flex-col border-t bg-background/50 divide-y transition-all animate-in fade-in duration-200">
                  {LANGUAGES.map((l) => {
                    const isSelected = l.code === lang;
                    return (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => changeLanguage(l.code, lang, pathname)}
                        className={`flex items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-accent/50 ${isSelected ? 'font-semibold text-primary' : 'text-muted-foreground'}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <l.Flag className="h-3.5 w-5 shrink-0 rounded-sm" />
                          <span>{l.name}</span>
                        </div>
                        {isSelected && <Check className="size-4 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {mounted && (
              <div className="flex items-center justify-between border rounded-lg p-3 bg-card/50">
                <div className="flex items-center gap-2.5 text-sm font-medium">
                  {resolvedTheme === 'dark' ? (
                    <Moon className="size-4 text-muted-foreground" />
                  ) : (
                    <Sun className="size-4 text-muted-foreground" />
                  )}
                  <span>{translations.toggleTheme}</span>
                </div>
                <div className="flex items-center gap-1 p-1 bg-muted rounded-md">
                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={`px-2.5 py-1 text-xs rounded font-medium transition-all ${resolvedTheme === 'light' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Light
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={`px-2.5 py-1 text-xs rounded font-medium transition-all ${resolvedTheme === 'dark' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Dark
                  </button>
                </div>
              </div>
            )}
          </div>

          {user && (
            <>
              <Separator />
              <button
                type="button"
                onClick={async () => {
                  await signOut(lang);
                }}
                className="flex items-center gap-2.5 p-2.5 text-sm rounded-lg border border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/20 font-medium transition-colors w-full"
              >
                <LogOut className="size-4 text-destructive" />
                <span>{translations.logout}</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
