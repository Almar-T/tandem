import { eachDayOfInterval, isSameDay, startOfDay, subDays } from '@/lib/dates'
import type { WorkSession } from '@/lib/types'

export type Range = 7 | 30 | 0 // 0 = all time

export function formatHours(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  if (h && m) return `${h}h ${m}m`
  return h ? `${h}h` : `${m}m`
}

export function filterRange(sessions: WorkSession[], range: Range): WorkSession[] {
  if (range === 0) return sessions
  const start = subDays(startOfDay(new Date()), range - 1).getTime()
  return sessions.filter((s) => new Date(s.started_at).getTime() >= start)
}

export interface Totals {
  active: number
  explained: number
  unexplained: number
  sessions: number
}

export function totalsFor(sessions: WorkSession[], userId: string): Totals {
  return sessions
    .filter((s) => s.user_id === userId)
    .reduce<Totals>(
      (acc, s) => ({
        active: acc.active + s.active_sec,
        explained: acc.explained + s.idle_explained_sec,
        unexplained: acc.unexplained + s.idle_unexplained_sec,
        sessions: acc.sessions + 1,
      }),
      { active: 0, explained: 0, unexplained: 0, sessions: 0 },
    )
}

export interface DayBar {
  day: Date
  perUser: Record<string, number> // userId -> active seconds
}

/** Active seconds per user per day across the range (empty for all-time). */
export function dailyActive(sessions: WorkSession[], range: Range, userIds: string[]): DayBar[] {
  if (range === 0) return []
  const days = eachDayOfInterval({
    start: subDays(startOfDay(new Date()), range - 1),
    end: new Date(),
  })
  return days.map((day) => {
    const perUser: Record<string, number> = {}
    for (const uid of userIds) {
      perUser[uid] = sessions
        .filter((s) => s.user_id === uid && isSameDay(new Date(s.started_at), day))
        .reduce((sum, s) => sum + s.active_sec, 0)
    }
    return { day, perUser }
  })
}
