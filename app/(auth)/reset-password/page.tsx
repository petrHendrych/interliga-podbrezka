'use client';

import React, { useActionState, use } from 'react';
import Link from 'next/link';
import { resetPassword } from '@/lib/auth-actions';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default function ResetPasswordPage({ searchParams }: PageProps) {
  const params = use(searchParams);
  const { token } = params;
  const [state, action, isPending] = useActionState(resetPassword, null);

  if (!token) {
    return (
      <div className="space-y-6 text-center">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Chýbajúci token</h2>
          <p className="text-sm text-muted-foreground">
            Tento odkaz na resetovanie hesla je neplatný.
          </p>
        </div>
        <Link
          href="/forgot-password"
          className={cn(buttonVariants({ variant: 'default' }), 'w-full flex justify-center items-center')}
        >
          Požiadať o nový odkaz
        </Link>
      </div>
    );
  }

  if (state?.success) {
    return (
      <div className="space-y-6 text-center">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Heslo zmenené</h2>
          <p className="text-sm text-muted-foreground">
            Vaše heslo bolo úspešne aktualizované.
          </p>
        </div>
        <Link
          href="/sign-in"
          className={cn(buttonVariants({ variant: 'default' }), 'w-full flex justify-center items-center')}
        >
          Prihlásiť sa
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Nové heslo</h2>
        <p className="text-sm text-muted-foreground">Zadajte svoje nové heslo</p>
      </div>
      <form action={action} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <div className="space-y-2">
          <label
            htmlFor="password"
            className="text-sm font-medium leading-none"
          >
            Nové heslo
            <input
              id="password"
              name="password"
              type="password"
              required
              className="mt-2 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>
        </div>
        {state?.error && (
          <p className="text-sm font-medium text-destructive text-center">{state.error}</p>
        )}
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? 'Aktualizujem...' : 'Zmeniť heslo'}
        </Button>
      </form>
    </div>
  );
}
