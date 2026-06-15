import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Goal } from '@/lib/types'

const KEY = ['goals']

/** Shared goals, live-synced. Full goal management arrives in Phase 4. */
export function useGoals() {
  const qc = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel('goals-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'goals' },
        () => qc.invalidateQueries({ queryKey: KEY }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [qc])

  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Goal[]> => {
      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })
}
