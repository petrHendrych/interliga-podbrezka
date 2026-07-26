import React from 'react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Locale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);

  return (
    <div className="space-y-6 text-center">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">{dict.auth.functionUnavailableTitle}</h2>
        <p className="text-sm text-muted-foreground">
          {dict.auth.changePasswordDisabled}
        </p>
      </div>
      <Link
        href={`/${lang}/sign-in`}
        className={cn(
          buttonVariants({ variant: 'default' }),
          'w-full flex justify-center items-center',
        )}
      >
        {dict.auth.backToSignIn}
      </Link>
    </div>
  );
}
