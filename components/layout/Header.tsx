import Link from 'next/link';
import { ModeToggle } from '@/components/layout/ModeToggle';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { UserDropdown } from '@/components/layout/UserDropdown';
import { MobileNav } from '@/components/layout/MobileNav';
import { BrandTitle } from '@/components/layout/BrandTitle';
import { getSession } from '@/lib/session';
import { Locale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';

export async function Header({ lang }: { lang: Locale }) {
  const session = await getSession();
  const dict = await getDictionary(lang);
  const user = session?.user;

  const translations = {
    rules: dict.common.rules,
    withdrawals: dict.common.withdrawals,
    settings: dict.common.settings,
    manageUsers: dict.common.manageUsers,
    manualMatches: dict.common.manualMatches,
    syncData: dict.common.syncData,
    syncing: dict.common.syncing,
    syncConfirmTitle: dict.common.syncConfirmTitle,
    syncConfirmDescription: dict.common.syncConfirmDescription,
    cancel: dict.common.cancel,
    logout: dict.common.logout,
    switchLanguage: dict.common.switchLanguage,
    toggleTheme: dict.common.toggleTheme,
  };

  const pwa = {
    notificationsEnable: dict.pwa.notificationsEnable,
    notificationsDisable: dict.pwa.notificationsDisable,
    notificationsBlocked: dict.pwa.notificationsBlocked,
    notifyUsers: dict.pwa.notifyUsers,
    notifySending: dict.pwa.notifySending,
    notifyConfirmTitle: dict.pwa.notifyConfirmTitle,
    notifyConfirmDescription: dict.pwa.notifyConfirmDescription,
    notifyErrors: dict.pwa.notifyErrors,
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 pt-[var(--app-safe-top)] backdrop-blur supports-backdrop-filter:bg-background/60">
      {/* Desktop Navigation */}
      <div className="hidden md:flex h-16 items-center justify-between px-4 sm:px-8">
        <div className="w-48" />

        <Link href={`/${lang}`} className="flex items-center">
          <BrandTitle className="text-lg sm:text-xl tracking-widest" />
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
                rules: dict.common.rules,
                withdrawals: dict.common.withdrawals,
                settings: dict.common.settings,
                manageUsers: dict.common.manageUsers,
                manualMatches: dict.common.manualMatches,
                syncData: dict.common.syncData,
                syncing: dict.common.syncing,
                syncConfirmTitle: dict.common.syncConfirmTitle,
                syncConfirmDescription: dict.common.syncConfirmDescription,
                cancel: dict.common.cancel,
                logout: dict.common.logout,
              }}
              pwa={pwa}
            />
          )}
        </div>
      </div>

      {/* Mobile Navigation */}
      <MobileNav
        user={user}
        lang={lang}
        translations={translations}
        pwa={pwa}
      />
    </header>
  );
}
