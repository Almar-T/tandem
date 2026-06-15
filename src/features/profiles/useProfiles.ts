import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/types'

/** Both members. Cached aggressively — the roster changes ~never. */
export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    staleTime: Infinity,
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })
}

/** First letter of a display name, for compact assignee avatars. */
export function initialOf(name: string | undefined): string {
  return (name?.trim()[0] ?? '?').toUpperCase()
}
