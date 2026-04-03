import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-background py-6">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 text-xs text-text-secondary sm:flex-row sm:justify-between">
        <p>&copy; {new Date().getFullYear()} Good Fights. All rights reserved.</p>
        <div className="flex gap-4">
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/delete-account" className="hover:text-foreground">Delete Account</Link>
          <Link href="/feedback" className="hover:text-foreground">Feedback</Link>
        </div>
      </div>
    </footer>
  );
}
