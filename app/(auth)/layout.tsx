import React from 'react';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background/50">
      <div className="w-full max-w-sm space-y-8">
        <div className="bg-card ring-1 ring-foreground/10 rounded-xl shadow-sm p-6 sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
