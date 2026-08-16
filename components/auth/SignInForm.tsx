'use client';

import React, { useActionState } from 'react';
import Link from 'next/link';
import { signIn } from '@/lib/auth-actions';
import { Button } from '@/components/ui/button';
import { PasskeySignInButton } from '@/components/auth/PasskeySignInButton';
import { Dictionary } from '@/lib/i18n/types';

interface SignInFormProps {
  lang: string;
  dict: Dictionary['auth'];
}

export default function SignInForm({ lang, dict }: SignInFormProps) {
  const [state, action, isPending] = useActionState(signIn, null);

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-semibold">{dict.signInTitle}</h2>
        <p className="text-sm text-muted-foreground">{dict.signInDescription}</p>
      </div>
      <PasskeySignInButton
        lang={lang}
        translations={{
          passkeySignIn: dict.passkeySignIn,
          passkeySigningIn: dict.passkeySigningIn,
          passkeyDivider: dict.passkeyDivider,
          errors: dict.errors,
        }}
      />
      <form action={action} className="space-y-4">
        {/* Lets the action redirect back into the current locale instead of a slug-less path. */}
        <input type="hidden" name="lang" value={lang} />
        <div className="space-y-2">
          <label
            htmlFor="email"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            {dict.emailLabel}
            <input
              id="email"
              name="email"
              type="email"
              placeholder={dict.emailPlaceholder}
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
              <span>{dict.passwordLabel}</span>
              {/* Commented out for now
              <Link
                href={`/${lang}/forgot-password`}
                className="text-xs font-medium text-primary underline
                  underline-offset-4 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {dict.forgotPasswordLink}
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
          <p className="text-sm font-medium text-destructive text-center">
            {dict.errors[state.error as keyof typeof dict.errors] || state.error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? dict.signingInButton : dict.signInButton}
        </Button>
        <div className="text-center text-sm mt-4 flex justify-between">
          <span>{dict.noAccountText}</span>
          <Link
            href={`/${lang}/sign-up`}
            className="font-medium text-primary underline underline-offset-4 hover:underline"
          >
            {dict.signUpLink}
          </Link>
        </div>
      </form>
    </div>
  );
}
