'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/lib/auth';
import { OrgFilterProvider } from '@/lib/orgFilter';
import { SpoilerFreeProvider } from '@/lib/spoilerFree';
import type { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <OrgFilterProvider>
          <SpoilerFreeProvider>
            {children}
          </SpoilerFreeProvider>
        </OrgFilterProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
