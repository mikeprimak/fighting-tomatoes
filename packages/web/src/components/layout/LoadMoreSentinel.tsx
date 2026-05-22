'use client';

import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

interface LoadMoreSentinelProps {
  hasMore: boolean;
  isFetching: boolean;
  onIntersect: () => void;
  rootMargin?: string;
}

export function LoadMoreSentinel({ hasMore, isFetching, onIntersect, rootMargin = '400px' }: LoadMoreSentinelProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasMore) return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting && !isFetching) {
            onIntersect();
            break;
          }
        }
      },
      { rootMargin },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, isFetching, onIntersect, rootMargin]);

  if (!hasMore) return null;

  return (
    <div ref={ref} className="flex justify-center py-6">
      {isFetching && <Loader2 className="h-5 w-5 animate-spin text-text-secondary" />}
    </div>
  );
}
