'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, User, Menu, X, Flame, Radio, Star, Trophy, LogOut, LogIn } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';

const navLinks = [
  { href: '/events/live', label: 'Live', icon: Radio },
  { href: '/', label: 'Upcoming', icon: Flame },
  { href: '/events/past', label: 'Past', icon: Star },
  { href: '/fights/top', label: 'Good Fights', icon: Trophy },
];

export function Navbar() {
  const pathname = usePathname();
  const { user, isAuthenticated, logout, isGuest } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/' || pathname === '/events/upcoming';
    return pathname.startsWith(href);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/search?q=${encodeURIComponent(searchQuery.trim())}`;
      setSearchOpen(false);
      setSearchQuery('');
    }
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex h-14 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-primary">GOOD FIGHTS</span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden items-center gap-1 md:flex">
            {navLinks.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive(href)
                    ? 'bg-primary/10 text-primary'
                    : 'text-text-secondary hover:text-foreground'
                }`}
              >
                <Icon size={16} />
                {label}
              </Link>
            ))}
          </div>

          {/* Right side: search + auth */}
          <div className="flex items-center gap-2">
            {/* Search */}
            {searchOpen ? (
              <form onSubmit={handleSearch} className="flex items-center">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search fighters, fights, events..."
                  className="w-48 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-text-secondary focus:border-primary focus:outline-none md:w-64"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
                  className="ml-1 p-1 text-text-secondary hover:text-foreground"
                >
                  <X size={16} />
                </button>
              </form>
            ) : (
              <button
                onClick={() => setSearchOpen(true)}
                className="rounded-lg p-2 text-text-secondary hover:text-foreground"
              >
                <Search size={18} />
              </button>
            )}

            {/* Auth */}
            {isAuthenticated ? (
              <div className="hidden items-center gap-2 md:flex">
                <Link
                  href="/profile"
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    pathname === '/profile' ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:text-foreground'
                  }`}
                >
                  <User size={16} />
                  {user?.displayName || 'Profile'}
                </Link>
                <button
                  onClick={() => logout()}
                  className="rounded-lg p-2 text-text-secondary hover:text-danger"
                  title="Log out"
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="hidden items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-text-on-accent hover:bg-primary/90 md:flex"
              >
                <LogIn size={16} />
                Sign In
              </Link>
            )}

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="rounded-lg p-2 text-text-secondary hover:text-foreground md:hidden"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="border-t border-border bg-background px-4 py-2 md:hidden">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${
                isActive(href) ? 'bg-primary/10 text-primary' : 'text-text-secondary'
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
          <div className="my-1 border-t border-border" />
          {isAuthenticated ? (
            <>
              <Link
                href="/profile"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-text-secondary"
              >
                <User size={16} />
                {user?.displayName || 'Profile'}
              </Link>
              <button
                onClick={() => { logout(); setMobileMenuOpen(false); }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-danger"
              >
                <LogOut size={16} />
                Log Out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-primary"
            >
              <LogIn size={16} />
              Sign In
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
