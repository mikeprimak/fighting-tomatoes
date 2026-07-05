'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Search, User, Menu, X, Home, Flame, Radio, Star, Trophy, EyeOff, Eye, Smartphone, Users, Calendar, Shield } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth, useHasApp } from '@/lib/auth';
import { useSpoilerFree } from '@/lib/spoilerFree';
import { useAnyLiveEvent } from '@/lib/useAnyLiveEvent';
import { searchSuggest } from '@/lib/api';
import { FighterAvatar } from '@/components/FighterAvatar';

const navLinks = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/events/live', label: 'Live', icon: Radio },
  { href: '/events/upcoming', label: 'Upcoming', icon: Flame },
  { href: '/events/past', label: 'Past', icon: Star },
  { href: '/fights/top', label: 'Good Fights', icon: Trophy },
  { href: '/fighters', label: 'Fighters', icon: Users },
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
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const router = useRouter();

  // Debounce typing so suggestions don't fire on every keystroke
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 250);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const { data: suggestData } = useQuery({
    queryKey: ['search-suggest', debouncedQuery],
    queryFn: () => searchSuggest(debouncedQuery),
    enabled: searchOpen && debouncedQuery.length >= 2,
    staleTime: 30 * 1000,
  });

  const suggestions = suggestData?.data;
  const hasSuggestions =
    !!suggestions &&
    (suggestions.fighters.length > 0 ||
      suggestions.events.length > 0 ||
      suggestions.promotions.length > 0);
  const showSuggestions =
    searchOpen && searchFocused && searchQuery.trim().length >= 2 && hasSuggestions;

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchFocused(false);
  };

  const goToSuggestion = (href: string) => {
    closeSearch();
    router.push(href);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      const q = searchQuery.trim();
      closeSearch();
      router.push(`/search?q=${encodeURIComponent(q)}`);
    }
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex h-14 items-center justify-between">
          {/* Logo — full wordmark image (glove + GOOD FIGHTS) */}
          <Link href="/" className="flex items-center">
            <img
              src="/good-fights-logo-line-thickened.png"
              alt="Good Fights"
              className="h-8 w-auto shrink-0 object-contain"
            />
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
              <div className="relative">
                <form onSubmit={handleSearch} className="flex items-center">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                    placeholder="Search fighters, fights, events..."
                    className="w-48 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-text-secondary focus:border-primary focus:outline-none md:w-64"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={closeSearch}
                    className="ml-1 p-1 text-text-secondary hover:text-foreground"
                  >
                    <X size={16} />
                  </button>
                </form>

                {/* Predictive suggestions */}
                {showSuggestions && suggestions && (
                  <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-lg border border-border bg-card shadow-lg md:w-80">
                    {suggestions.fighters.map((fighter) => (
                      <button
                        key={`fighter-${fighter.id}`}
                        onClick={() => goToSuggestion(`/fighters/${fighter.id}`)}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-background"
                      >
                        <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-background">
                          <FighterAvatar
                            src={fighter.profileImage}
                            initials={`${fighter.firstName?.[0] ?? ''}${fighter.lastName?.[0] ?? ''}`}
                            imgClassName="h-full w-full object-cover"
                            initialsClassName="flex h-full w-full items-center justify-center text-xs font-bold text-text-secondary"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {fighter.firstName} {fighter.lastName}
                            {fighter.isChampion ? ' 🏆' : ''}
                          </p>
                          <p className="truncate text-xs text-text-secondary">
                            {[fighter.record, fighter.nickname ? `"${fighter.nickname}"` : null]
                              .filter(Boolean)
                              .join(' · ') || 'Fighter'}
                          </p>
                        </div>
                      </button>
                    ))}

                    {suggestions.events.map((event) => (
                      <button
                        key={`event-${event.id}`}
                        onClick={() => goToSuggestion(`/events/${event.id}`)}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-background"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background">
                          <Calendar size={14} className="text-text-secondary" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{event.name}</p>
                          <p className="truncate text-xs text-text-secondary">
                            {event.promotion} · {new Date(event.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        </div>
                      </button>
                    ))}

                    {suggestions.promotions.map((promotion) => (
                      <button
                        key={`promotion-${promotion.name}`}
                        onClick={() => goToSuggestion(`/search?q=${encodeURIComponent(promotion.name)}`)}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-background"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background">
                          <Shield size={14} className="text-text-secondary" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{promotion.name}</p>
                          <p className="text-xs text-text-secondary">Promotion</p>
                        </div>
                      </button>
                    ))}

                    <button
                      onClick={() => goToSuggestion(`/search?q=${encodeURIComponent(searchQuery.trim())}`)}
                      className="flex w-full items-center gap-3 border-t border-border px-3 py-2 text-left transition-colors hover:bg-background"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background">
                        <Search size={14} className="text-primary" />
                      </div>
                      <p className="truncate text-sm font-medium text-primary">
                        See all results for &quot;{searchQuery.trim()}&quot;
                      </p>
                    </button>
                  </div>
                )}
              </div>
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
