'use client';

import React, { useActionState } from 'react';
import Link from 'next/link';
import { signUp } from '@/lib/auth-actions';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Dictionary } from '@/lib/i18n/types';

interface SignUpFormProps {
  lang: string;
  dict: Dictionary['auth'];
}

export default function SignUpForm({ lang, dict }: SignUpFormProps) {
  const [state, action, isPending] = useActionState(signUp, null);

  if (state?.success) {
    return (
      <div className="space-y-6 text-center">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">{dict.signUpSuccessTitle}</h2>
          <p className="text-sm text-muted-foreground">
            {dict.signUpSuccessDescription}
          </p>
        </div>
        <p className="text-sm">
          {dict.signUpSuccessWait}
        </p>
        <Link
          href={`/${lang}/sign-in`}
          className={cn(buttonVariants({ variant: 'default' }), 'w-full flex justify-center items-center')}
        >
          {dict.backToSignIn}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">{dict.signUpTitle}</h2>
        <p className="text-sm text-muted-foreground">{dict.signUpDescription}</p>
      </div>
      <form action={action} className="space-y-4">
        <div className="space-y-2">
          <label
            htmlFor="name"
            className="text-sm font-medium leading-none"
          >
            {dict.nameLabel}
            <input
              id="name"
              name="name"
              type="text"
              placeholder={dict.namePlaceholder}
              required
              className="mt-2 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>
        </div>
        <div className="space-y-2">
          <label
            htmlFor="email"
            className="text-sm font-medium leading-none"
          >
            {dict.emailLabel}
            <input
              id="email"
              name="email"
              type="email"
              placeholder={dict.emailPlaceholder}
              required
              className="mt-2 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>
        </div>
        <div className="space-y-2">
          <label
            htmlFor="password"
            className="text-sm font-medium leading-none"
          >
            {dict.passwordLabel}
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
          <p className="text-sm font-medium text-destructive text-center">
            {dict.errors[state.error as keyof typeof dict.errors] || state.error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? dict.signingUpButton : dict.signUpButton}
        </Button>
        <div className="text-center text-sm mt-4 flex justify-between">
          <span>{dict.alreadyHaveAccountText}</span>
          <Link href={`/${lang}/sign-in`} className="font-medium text-primary underline underline-offset-4 hover:underline">
            {dict.signInLink}
          </Link>
        </div>
      </form>
    </div>
  );
}
