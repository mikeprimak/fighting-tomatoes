'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/lib/auth';
import { OrgFilterProvider } from '@/lib/orgFilter';
import { SpoilerFreeProvider } from '@/lib/spoilerFree';
import { BroadcastRegionProvider } from '@/lib/broadcastRegion';
import type { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <OrgFilterProvider>
          <SpoilerFreeProvider>
            <BroadcastRegionProvider>
              {children}
            </BroadcastRegionProvider>
          </SpoilerFreeProvider>
        </OrgFilterProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
