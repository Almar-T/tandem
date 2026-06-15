import { supabase } from '@/lib/supabase'
import type { Goal, Milestone } from '@/lib/types'

export type GoalInsert = Partial<Goal> & { title: string }
export interface MilestoneDraft {
  title: string
  target_date: string | null
  done: boolean
}

export async function insertGoal(input: GoalInsert): Promise<Goal> {
  const { data, error } = await supabase.from('goals').insert(input).select('*').single()
  if (error) throw error
  return data as Goal
}

export async function updateGoalApi(id: string, patch: Partial<Goal>): Promise<void> {
  const { error } = await supabase.from('goals').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteGoalApi(id: string): Promise<void> {
  const { error } = await supabase.from('goals').delete().eq('id', id)
  if (error) throw error
}

export async function fetchMilestones(goalId: string): Promise<Milestone[]> {
  const { data, error } = await supabase
    .from('milestones')
    .select('*')
    .eq('goal_id', goalId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data ?? []
}

/** Simple sync: wipe and re-insert the goal's milestones from the editor state. */
export async function replaceMilestones(goalId: string, items: MilestoneDraft[]): Promise<void> {
  const del = await supabase.from('milestones').delete().eq('goal_id', goalId)
  if (del.error) throw del.error
  if (items.length) {
    const rows = items.map((m, i) => ({
      goal_id: goalId,
      title: m.title,
      target_date: m.target_date,
      done: m.done,
      sort_order: i,
    }))
    const ins = await supabase.from('milestones').insert(rows)
    if (ins.error) throw ins.error
  }
}

export async function setMilestoneDone(id: string, done: boolean): Promise<void> {
  const { error } = await supabase.from('milestones').update({ done }).eq('id', id)
  if (error) throw error
}
