import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface BrowserActivityRow {
  id: string
  user_id: string
  recorded_at: string
  domain: string
  url: string
  title: string | null
  active_sec: number
  keystrokes: number
  clicks: number
}

export interface DomainSummary {
  domain: string
  active_sec: number
  keystrokes: number
  clicks: number
}

export function useBrowserActivity(rangeDays: number) {
  return useQuery({
    queryKey: ['browser_activity', rangeDays],
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      let query = supabase
        .from('browser_activity')
        .select('*')
        .order('recorded_at', { ascending: false })

      if (rangeDays > 0) {
        const since = new Date(Date.now() - rangeDays * 86_400_000).toISOString()
        query = query.gte('recorded_at', since)
      }

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as BrowserActivityRow[]
    },
  })
}

/** Aggregate rows into per-domain + per-user summaries. */
export function summariseByDomain(
  rows: BrowserActivityRow[],
  userId?: string,
): DomainSummary[] {
  const map = new Map<string, DomainSummary>()
  for (const r of rows) {
    if (userId && r.user_id !== userId) continue
    const prev = map.get(r.domain) ?? { domain: r.domain, active_sec: 0, keystrokes: 0, clicks: 0 }
    map.set(r.domain, {
      domain: r.domain,
      active_sec: prev.active_sec + r.active_sec,
      keystrokes: prev.keystrokes + r.keystrokes,
      clicks: prev.clicks + r.clicks,
    })
  }
  return [...map.values()].sort((a, b) => b.active_sec - a.active_sec)
}
