'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ChevronDown, Users, RefreshCw, ClipboardList, LogOut, BookOpen, Wallet, Bell, KeyRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { signOut } from '@/lib/auth-actions';
import { clearServiceWorkerCaches } from '@/lib/pwa/clear-service-worker-caches';
import { Locale } from '@/lib/i18n/config';
import { useSyncData } from '@/lib/hooks/useSyncData';
import { useNotifyUsers } from '@/lib/hooks/useNotifyUsers';
import { SyncDataDialog } from '@/components/layout/SyncDataDialog';
import { NotifyUsersDialog } from '@/components/layout/NotifyUsersDialog';
import { PushNotificationToggle, type PushToggleTranslations } from '@/components/pwa/PushNotificationToggle';
import type { NotifyUsersDialogTranslations } from '@/components/layout/NotifyUsersDialog';

export type PushMenuTranslations =
  PushToggleTranslations & Omit<NotifyUsersDialogTranslations, 'cancel'>;

interface UserDropdownProps {
  user: {
    id: string;
    name: string;
    role: string;
  };
  lang: Locale;
  translations: {
    rules: string;
    withdrawals: string;
    settings: string;
    manageUsers: string;
    manualMatches: string;
    syncData: string;
    syncing: string;
    syncConfirmTitle: string;
    syncConfirmDescription: string;
    cancel: string;
    logout: string;
  };
  pwa: PushMenuTranslations;
}

const MENU_ITEM_CLASS = 'flex items-center gap-2 w-full disabled:opacity-50';

export function UserDropdown({
  user,
  lang,
  translations,
  pwa,
}: UserDropdownProps) {
  const {
    isSyncing, isConfirmOpen, requestSync, setConfirmOpen, confirmSync,
  } = useSyncData();
  const {
    isNotifying, isConfirmOpen: isNotifyOpen, error: notifyError,
    requestNotify, setConfirmOpen: setNotifyOpen, confirmNotify,
  } = useNotifyUsers();
  const isAdmin = user.role === 'admin';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={(
            <Button
              variant="ghost"
              className="flex items-center gap-2 h-9 px-2.5 rounded-lg border border-transparent hover:bg-accent focus:bg-accent data-[state=open]:bg-accent"
            />
          )}
        >
          <span className="text-sm font-medium max-w-30 truncate sm:max-w-45">
            {user.name}
          </span>
          <ChevronDown className="size-3.5 text-muted-foreground shrink-0 transition-transform duration-200" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 p-1.5">
          <DropdownMenuItem className="gap-2 cursor-pointer py-2">
            <Link
              href={`/${lang}/rules`}
              className="flex items-center gap-2 w-full"
            >
              <BookOpen className="size-4 text-muted-foreground" />
              <span>{translations.rules}</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2 cursor-pointer py-2">
            <Link
              href={`/${lang}/withdrawals`}
              className="flex items-center gap-2 w-full"
            >
              <Wallet className="size-4 text-muted-foreground" />
              <span>{translations.withdrawals}</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2 cursor-pointer py-2">
            <Link
              href={`/${lang}/settings`}
              className="flex items-center gap-2 w-full"
            >
              <KeyRound className="size-4 text-muted-foreground" />
              <span>{translations.settings}</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2 cursor-pointer py-2">
            <PushNotificationToggle
              lang={lang}
              translations={pwa}
              className={MENU_ITEM_CLASS}
            />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {isAdmin && (
            <>
              <DropdownMenuItem className="gap-2 cursor-pointer py-2">
                <Link
                  href={`/${lang}/admin/users`}
                  className="flex items-center gap-2 w-full"
                >
                  <Users className="size-4 text-muted-foreground" />
                  <span>{translations.manageUsers}</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={requestSync}
                disabled={isSyncing}
                className="gap-2 cursor-pointer py-2"
              >
                <RefreshCw className={`size-4 text-muted-foreground ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? translations.syncing : translations.syncData}</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 cursor-pointer py-2">
                <Link
                  href={`/${lang}/admin/matches`}
                  className="flex items-center gap-2 w-full"
                >
                  <ClipboardList className="size-4 text-muted-foreground" />
                  <span>{translations.manualMatches}</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={requestNotify}
                disabled={isNotifying}
                className="gap-2 cursor-pointer py-2"
              >
                <Bell className="size-4 text-muted-foreground" />
                <span>{isNotifying ? pwa.notifySending : pwa.notifyUsers}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem
            className="gap-2 cursor-pointer py-2 text-destructive focus:text-destructive focus:bg-destructive/10"
            onClick={async () => {
              clearServiceWorkerCaches();
              await signOut(lang);
            }}
          >
            <LogOut className="size-4 text-destructive" />
            <span className="font-medium">{translations.logout}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {isAdmin && (
        <>
          <SyncDataDialog
            open={isConfirmOpen}
            onOpenChange={setConfirmOpen}
            isSyncing={isSyncing}
            onConfirm={confirmSync}
            translations={{
              syncData: translations.syncData,
              syncing: translations.syncing,
              syncConfirmTitle: translations.syncConfirmTitle,
              syncConfirmDescription: translations.syncConfirmDescription,
              cancel: translations.cancel,
            }}
          />
          <NotifyUsersDialog
            open={isNotifyOpen}
            onOpenChange={setNotifyOpen}
            isNotifying={isNotifying}
            error={notifyError}
            onConfirm={confirmNotify}
            translations={{ ...pwa, cancel: translations.cancel }}
          />
        </>
      )}
    </>
  );
}
