'use client';

import React, { useActionState } from 'react';
import Link from 'next/link';
import { signIn } from '@/lib/auth-actions';
import { Button } from '@/components/ui/button';

export default function SignInPage() {
  const [state, action, isPending] = useActionState(signIn, null);

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-semibold">Prihlásenie</h2>
        <p className="text-sm text-muted-foreground">Zadajte svoje údaje pre prístup k účtu</p>
      </div>
      <form action={action} className="space-y-4">
        <div className="space-y-2">
          <label
            htmlFor="email"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Email
            <input
              id="email"
              name="email"
              type="email"
              placeholder="meno@priklad.sk"
              required
              className="mt-2 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1
                text-base shadow-sm transition-colors file:border-0 file:bg-transparent
                file:text-sm file:font-medium placeholder:text-muted-foreground
                focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
                disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>
        </div>
        <div className="space-y-2">
          <label
            htmlFor="password"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            <div className="flex items-center justify-between mb-2">
              <span>Heslo</span>
              {/* Commented out for now as per issue description
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-primary underline
                  underline-offset-4 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Zabudli ste heslo?
              </Link>
              */}
            </div>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1
                text-base shadow-sm transition-colors file:border-0 file:bg-transparent
                file:text-sm file:font-medium placeholder:text-muted-foreground
                focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
                disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>
        </div>
        {state?.error && (
        <p className="text-sm font-medium text-destructive text-center">{state.error}</p>
        )}
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? 'Prihlasujem...' : 'Prihlásiť sa'}
        </Button>
        <div className="text-center text-sm mt-4 flex justify-between">
          <span>Nemáte účet?</span>
          <Link
            href="/sign-up"
            className="font-medium text-primary underline underline-offset-4 hover:underline"
          >
            Zaregistrujte sa
          </Link>
        </div>
      </form>
    </div>
  );
}
