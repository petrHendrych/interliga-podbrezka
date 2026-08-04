import React from 'react';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-background/50 p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="bg-card ring-1 ring-foreground/10 rounded-xl shadow-lift-lg p-6 sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
