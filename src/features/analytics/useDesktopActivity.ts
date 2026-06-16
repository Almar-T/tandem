import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface DesktopActivityRow {
  id: string
  user_id: string
  recorded_at: string
  app_name: string
  window_title: string | null
  active_sec: number
}

export interface AppSummary {
  app_name: string
  active_sec: number
}

export function useDesktopActivity(rangeDays: number) {
  return useQuery({
    queryKey: ['desktop_activity', rangeDays],
    queryFn: async () => {
      let query = supabase
        .from('desktop_activity')
        .select('*')
        .order('recorded_at', { ascending: false })
      if (rangeDays > 0) {
        const since = new Date(Date.now() - rangeDays * 86_400_000).toISOString()
        query = query.gte('recorded_at', since)
      }
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as DesktopActivityRow[]
    },
  })
}

export function summariseByApp(rows: DesktopActivityRow[], userId?: string): AppSummary[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    if (userId && r.user_id !== userId) continue
    map.set(r.app_name, (map.get(r.app_name) ?? 0) + r.active_sec)
  }
  return [...map.entries()]
    .map(([app_name, active_sec]) => ({ app_name, active_sec }))
    .sort((a, b) => b.active_sec - a.active_sec)
}
