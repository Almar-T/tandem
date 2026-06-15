import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { WorkSession } from '@/lib/types'

/**
 * All completed work sessions (both users — the table is shared, so each of you
 * can see the other's stats). Historical from day one.
 */
export function useWorkSessions() {
  return useQuery({
    queryKey: ['work_sessions'],
    queryFn: async (): Promise<WorkSession[]> => {
      const { data, error } = await supabase
        .from('work_sessions')
        .select('*')
        .not('ended_at', 'is', null)
        .order('started_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })
}
