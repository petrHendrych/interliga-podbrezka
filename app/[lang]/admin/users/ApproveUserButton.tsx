'use client';

import { useState, useTransition } from 'react';
import { Loader2, UserRoundCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { approveUser, type AdminActionError } from '@/lib/admin-actions';

interface ApproveUserButtonProps {
  userId: string;
  label: string;
  translations: {
    errors: Record<AdminActionError, string>;
  };
}

export function ApproveUserButton({ userId, label, translations }: ApproveUserButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<AdminActionError | null>(null);

  const handleApprove = () => {
    setError(null);
    startTransition(async () => {
      const result = await approveUser(userId);
      if (!result.success) setError(result.error);
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Button type="button" size="sm" onClick={handleApprove} disabled={isPending}>
        {isPending ? <Loader2 className="animate-spin" /> : <UserRoundCheck />}
        {label}
      </Button>
      {error && (
        <p className="rounded-lg bg-destructive/15 px-2 py-1 text-xs text-destructive">
          {translations.errors[error]}
        </p>
      )}
    </div>
  );
}
