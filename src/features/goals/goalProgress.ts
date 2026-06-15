import type { Goal, Task } from '@/lib/types'

export type Pace = 'ahead' | 'on_track' | 'behind' | 'no_date'

/**
 * Progress is derived live from linked tasks (% completed) so it's always
 * accurate. Falls back to the stored value when a goal has no tasks yet.
 */
export function goalProgress(goal: Goal, tasks: Task[]): number {
  const linked = tasks.filter((t) => t.goal_id === goal.id)
  if (linked.length === 0) return Math.round(goal.progress)
  const done = linked.filter((t) => t.status === 'completed').length
  return Math.round((done / linked.length) * 100)
}

/** Are we ahead / on track / behind, comparing progress to time elapsed? */
export function goalPace(goal: Goal, progress: number): Pace {
  if (!goal.target_date) return 'no_date'
  const start = new Date(goal.created_at).getTime()
  const end = new Date(goal.target_date).getTime()
  const now = Date.now()
  if (end <= start) return 'no_date'
  if (now >= end) return progress >= 100 ? 'ahead' : 'behind'
  const expected = ((now - start) / (end - start)) * 100
  if (progress >= expected + 10) return 'ahead'
  if (progress >= expected - 10) return 'on_track'
  return 'behind'
}

export const PACE_LABEL: Record<Pace, { label: string; badge: string }> = {
  ahead: { label: 'Ahead', badge: 'bg-green-900 text-green-300' },
  on_track: { label: 'On track', badge: 'bg-sky-900 text-sky-300' },
  behind: { label: 'Behind', badge: 'bg-red-900 text-red-300' },
  no_date: { label: 'No deadline', badge: 'bg-slate-700 text-slate-300' },
}
