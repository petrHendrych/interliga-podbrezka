'use client';

import React, { useActionState } from 'react';
import Link from 'next/link';
import { requestPasswordReset } from '@/lib/auth-actions';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function ForgotPasswordPage() {
  const [state, action, isPending] = useActionState(requestPasswordReset, null);

  if (state?.success) {
    return (
      <div className="space-y-6 text-center">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Email odoslaný</h2>
          <p className="text-sm text-muted-foreground">
            Ak k tomuto emailu existuje účet, odoslali sme naň inštrukcie na resetovanie hesla.
          </p>
        </div>
        <p className="text-sm">
          Skontrolujte si prosím doručenú poštu (aj priečinok spam).
        </p>
        <Link
          href="/sign-in"
          className={cn(buttonVariants({ variant: 'outline' }), 'w-full flex justify-center items-center')}
        >
          Späť na prihlásenie
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Zabudnuté heslo</h2>
        <p className="text-sm text-muted-foreground">Zadajte svoj email a pošleme vám odkaz na resetovanie</p>
      </div>
      <form action={action} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium leading-none">
            Email
            <input
              id="email"
              name="email"
              type="email"
              placeholder="meno@priklad.sk"
              required
              className="mt-2 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>
        </div>
        {state?.error && (
          <p className="text-sm font-medium text-destructive text-center">{state.error}</p>
        )}
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? 'Odosielam...' : 'Odoslať odkaz'}
        </Button>
        <div className="text-center text-sm mt-4">
          <Link href="/sign-in" className="font-medium text-primary underline-offset-4 hover:underline">
            Späť na prihlásenie
          </Link>
        </div>
      </form>
    </div>
  );
}
