import Link from 'next/link';

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-center px-4">
        <Link href="/" className="flex items-center">
          <span className="font-bold text-xl uppercase tracking-tighter sm:tracking-widest">
            Interliga Podbrezová
          </span>
        </Link>
      </div>
    </header>
  );
}
