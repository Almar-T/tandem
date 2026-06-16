import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface DistractionEvent {
  id: string
  user_id: string
  recorded_at: string
  domain: string
  reason: string | null
  action: 'explained' | 'break' | 'lock_in' | 'override'
  ai_approved: boolean | null
  ai_message: string | null
}

export function useDistractionEvents(rangeDays: number) {
  return useQuery({
    queryKey: ['distraction_events', rangeDays],
    queryFn: async () => {
      let query = supabase
        .from('distraction_events')
        .select('*')
        .order('recorded_at', { ascending: false })
      if (rangeDays > 0) {
        const since = new Date(Date.now() - rangeDays * 86_400_000).toISOString()
        query = query.gte('recorded_at', since)
      }
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as DistractionEvent[]
    },
  })
}
