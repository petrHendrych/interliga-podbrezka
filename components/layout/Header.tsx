import Link from 'next/link';
import { Users } from 'lucide-react';
import { SyncButton } from '@/components/SyncButton';
import { ModeToggle } from '@/components/layout/ModeToggle';
import { getSession } from '@/lib/session';
import { signOut } from '@/lib/auth-actions';

export async function Header() {
  const session = await getSession();
  const user = session?.user;
  const isAdmin = user?.role === 'admin';

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-2 w-24 sm:w-48 overflow-hidden">
          {user && (
            <div className="flex flex-col">
              <span className="text-xs font-medium truncate max-w-[100px] sm:max-w-full">
                {user.name}
              </span>
              <form action={signOut}>
                <button
                  type="submit"
                  className="text-[10px] text-muted-foreground hover:text-primary transition-colors text-left"
                >
                  Odhlásiť sa
                </button>
              </form>
            </div>
          )}
        </div>
        <Link href="/" className="flex items-center">
          <span className="font-bold text-lg sm:text-xl uppercase tracking-tighter sm:tracking-widest">
            Interliga Podbrezová
          </span>
        </Link>
        <div className="flex items-center gap-2 w-24 sm:w-48 justify-end">
          <ModeToggle />
          {isAdmin && (
            <>
              <Link
                href="/admin/users"
                className="p-2 hover:bg-accent rounded-md transition-colors"
                title="Správa používateľov"
              >
                <Users className="w-4 h-4" />
              </Link>
              <SyncButton />
            </>
          )}
        </div>
      </div>
    </header>
  );
}
