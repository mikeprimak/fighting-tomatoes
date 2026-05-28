import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-background py-6">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 text-xs text-text-secondary sm:flex-row sm:justify-between">
        <p>&copy; {new Date().getFullYear()} Good Fights. All rights reserved.</p>
        <div className="flex items-center gap-4">
          <Link href="/blog" className="hover:text-foreground">Blog</Link>
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/feedback" className="hover:text-foreground">Feedback</Link>
          <a
            href="https://x.com/GoodFightsApp"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Good Fights on X"
            className="hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
        </div>
      </div>
    </footer>
  );
}
