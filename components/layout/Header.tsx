import Link from 'next/link';
import { SyncButton } from '@/components/SyncButton';
import { ModeToggle } from '@/components/layout/ModeToggle';

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between px-4 sm:px-8">
        <div className="w-20 sm:w-32" />
        <Link href="/" className="flex items-center">
          <span className="font-bold text-lg sm:text-xl uppercase tracking-tighter sm:tracking-widest">
            Interliga Podbrezová
          </span>
        </Link>
        <div className="flex items-center gap-2 w-20 sm:w-32 justify-end">
          <ModeToggle />
          <SyncButton />
        </div>
      </div>
    </header>
  );
}
