import { QueryClient } from '@tanstack/react-query'

/**
 * Realtime subscriptions push fresh data, so we keep generous stale times and
 * rely on Supabase channel events to invalidate. Optimistic updates handle the
 * snappy local feel; the realtime echo reconciles both users.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
