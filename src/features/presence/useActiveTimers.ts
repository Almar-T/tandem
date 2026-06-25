import { useEffect, useId } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** Returns the set of user_ids that currently have an open (active) work session. */
export function useActiveTimers(): Set<string> {
  const qc = useQueryClient()
  const channelId = useId()

  const { data } = useQuery({
    queryKey: ['active_timers'],
    queryFn: async (): Promise<string[]> => {
      // Sessions started within the last 4 hours with no ended_at = actively timing.
      const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('work_sessions')
        .select('user_id')
        .is('ended_at', null)
        .gte('started_at', cutoff)
      if (error) throw error
      return (data ?? []).map((s: { user_id: string }) => s.user_id)
    },
    refetchInterval: 30_000,
  })

  useEffect(() => {
    const channel = supabase
      .channel(`active-timers-${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_sessions' }, () => {
        qc.invalidateQueries({ queryKey: ['active_timers'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [qc, channelId])

  return new Set(data ?? [])
}
