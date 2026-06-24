import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from '@/lib/dates'
import { useId } from 'react'
import { supabase } from '@/lib/supabase'

export interface DaySlot {
  title: string
  start: string        // "HH:MM" 24h local time
  end: string          // "HH:MM" 24h local time
  task_id?: string | null
  work_type?: string | null
  is_break: boolean
}

export interface DayPlan {
  user_id: string
  plan_date: string
  slots: DaySlot[]
}

export function useDayPlans(date: Date) {
  const qc = useQueryClient()
  const dateStr = format(date, 'yyyy-MM-dd')
  const channelId = useId()

  const query = useQuery({
    queryKey: ['day_plans', dateStr],
    queryFn: async (): Promise<DayPlan[]> => {
      const { data, error } = await supabase
        .from('day_plans')
        .select('user_id, plan_date, slots')
        .eq('plan_date', dateStr)
      if (error) throw error
      return (data ?? []).map((r) => ({
        user_id: r.user_id,
        plan_date: r.plan_date,
        slots: (r.slots ?? []) as DaySlot[],
      }))
    },
  })

  useEffect(() => {
    const channel = supabase
      .channel(`day-plans-${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'day_plans' }, () => {
        qc.invalidateQueries({ queryKey: ['day_plans', dateStr] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [dateStr, qc, channelId])

  return query
}
