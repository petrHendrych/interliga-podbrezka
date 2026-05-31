import React from 'react';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center text-center">
          <h1 className="text-3xl font-bold tracking-tight">Interliga Podbrezová</h1>
          <p className="text-sm text-muted-foreground mt-2">Prístup k údajom tímu</p>
        </div>
        <div className="bg-card border rounded-lg shadow-sm p-6 sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
