import Link from 'next/link';
import { ModeToggle } from '@/components/layout/ModeToggle';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { UserDropdown } from '@/components/layout/UserDropdown';
import { MobileNav } from '@/components/layout/MobileNav';
import { getSession } from '@/lib/session';
import { Locale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';

export async function Header({ lang }: { lang: Locale }) {
  const session = await getSession();
  const dict = await getDictionary(lang);
  const user = session?.user;

  const translations = {
    manageUsers: dict.common.manageUsers,
    syncData: dict.common.syncData,
    syncing: dict.common.syncing,
    logout: dict.common.logout,
    switchLanguage: dict.common.switchLanguage,
    toggleTheme: dict.common.toggleTheme,
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      {/* Desktop Navigation */}
      <div className="hidden md:flex h-16 items-center justify-between px-4 sm:px-8">
        <div className="w-48" />

        <Link href={`/${lang}`} className="flex items-center">
          <span className="font-bold text-lg sm:text-xl uppercase tracking-widest">
            Interliga Podbrezová
          </span>
        </Link>

        <div className="flex items-center gap-2 w-48 justify-end">
          <LanguageSwitcher
            lang={lang}
            translations={{
              switchLanguage: dict.common.switchLanguage,
            }}
          />
          <ModeToggle translations={{
            toggleTheme: dict.common.toggleTheme,
          }}
          />
          {user && (
            <UserDropdown
              user={user}
              lang={lang}
              translations={{
                manageUsers: dict.common.manageUsers,
                syncData: dict.common.syncData,
                syncing: dict.common.syncing,
                logout: dict.common.logout,
              }}
            />
          )}
        </div>
      </div>

      {/* Mobile Navigation */}
      <MobileNav
        user={user}
        lang={lang}
        translations={translations}
      />
    </header>
  );
}
