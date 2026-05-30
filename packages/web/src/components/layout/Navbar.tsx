'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, User, Menu, X, Flame, Radio, Star, Trophy, EyeOff, Eye, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { useAuth, useHasApp } from '@/lib/auth';
import { useSpoilerFree } from '@/lib/spoilerFree';
import { useAnyLiveEvent } from '@/lib/useAnyLiveEvent';

const navLinks = [
  { href: '/events/live', label: 'Live', icon: Radio },
  { href: '/', label: 'Upcoming', icon: Flame },
  { href: '/events/past', label: 'Past', icon: Star },
  { href: '/fights/top', label: 'Good Fights', icon: Trophy },
];

const GET_APP_URL = '/download?utm_source=web&utm_medium=navbar&utm_campaign=get-the-app';

export function Navbar() {
  const pathname = usePathname();
  const { user, isAuthenticated } = useAuth();
  const hasApp = useHasApp();
  const { spoilerFreeMode, setSpoilerFreeMode } = useSpoilerFree();
  const hasLiveEvent = useAnyLiveEvent();
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
            <img
              src="/good-fights-hand.png"
              alt=""
              aria-hidden="true"
              className="h-8 w-8 shrink-0 object-contain"
            />
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
                <span className="relative flex items-center">
                  <Icon size={16} />
                  {href === '/events/live' && hasLiveEvent && (
                    <span
                      className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-danger ring-2 ring-background"
                      aria-label="Live event in progress"
                    />
                  )}
                </span>
                {label}
              </Link>
            ))}
          </div>

          {/* Right side: get app + spoiler toggle + search + auth */}
          <div className="flex items-center gap-2">
            {/* Get the app — persistent CTA, hidden for confirmed app users */}
            {!hasApp && (
              <Link
                href={GET_APP_URL}
                className="hidden items-center gap-1.5 rounded-lg border border-primary/40 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10 md:flex"
              >
                <Smartphone size={16} />
                Get the app
              </Link>
            )}

            {/* Spoiler-free toggle */}
            <button
              onClick={() => setSpoilerFreeMode(!spoilerFreeMode)}
              className={`rounded-lg p-2 transition-colors ${
                spoilerFreeMode ? 'text-primary' : 'text-text-secondary hover:text-foreground'
              }`}
              title={spoilerFreeMode ? 'Spoiler-free mode: ON' : 'Spoiler-free mode: OFF'}
              aria-label="Toggle spoiler-free mode"
              aria-pressed={spoilerFreeMode}
            >
              {spoilerFreeMode ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>

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
              </div>
            ) : (
              <Link
                href="/login"
                className="hidden items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-text-on-accent hover:bg-primary/90 md:flex"
              >
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
              <span className="relative flex items-center">
                <Icon size={16} />
                {href === '/events/live' && hasLiveEvent && (
                  <span
                    className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-danger ring-2 ring-background"
                    aria-label="Live event in progress"
                  />
                )}
              </span>
              {label}
            </Link>
          ))}
          <div className="my-1 border-t border-border" />
          {!hasApp && (
            <Link
              href={GET_APP_URL}
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-primary"
            >
              <Smartphone size={16} />
              Get the app
            </Link>
          )}
          {isAuthenticated ? (
            <Link
              href="/profile"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-text-secondary"
            >
              <User size={16} />
              {user?.displayName || 'Profile'}
            </Link>
          ) : (
            <Link
              href="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center rounded-lg px-3 py-2.5 text-sm font-medium text-primary"
            >
              Sign In
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
