'use client';

import React from 'react';
import Link from 'next/link';
// import { resetPassword } from '@/lib/auth-actions';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function ResetPasswordPage() {
  // const [state, action, isPending] = useActionState(resetPassword, null);

  return (
    <div className="space-y-6 text-center">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">Funkcia nedostupná</h2>
        <p className="text-sm text-muted-foreground">
          Zmena hesla je momentálne zakázaná.
        </p>
      </div>
      <Link
        href="/sign-in"
        className={cn(
          buttonVariants({ variant: 'default' }),
          'w-full flex justify-center items-center',
        )}
      >
        Späť na prihlásenie
      </Link>
    </div>
  );
}
