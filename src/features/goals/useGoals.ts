import { useEffect, useId } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Goal } from '@/lib/types'
import {
  deleteGoalApi,
  fetchMilestones,
  insertGoal,
  replaceMilestones,
  setMilestoneDone,
  updateGoalApi,
  type GoalInsert,
  type MilestoneDraft,
} from './api'

const KEY = ['goals']

/** Shared goals + milestones, live-synced across both users. */
export function useGoals() {
  const qc = useQueryClient()
  // Unique per hook instance — multiple components use useGoals on one screen,
  // and Supabase rejects two channels sharing a name.
  const channelId = useId().replace(/[^a-zA-Z0-9]/g, '')

  useEffect(() => {
    const channel = supabase
      .channel(`goals-changes-${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goals' }, () =>
        qc.invalidateQueries({ queryKey: KEY }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'milestones' }, () =>
        qc.invalidateQueries({ queryKey: ['milestones'] }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [qc, channelId])

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

export function useMilestones(goalId: string) {
  return useQuery({
    queryKey: ['milestones', goalId],
    enabled: !!goalId,
    queryFn: () => fetchMilestones(goalId),
  })
}

export function useCreateGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ goal, milestones }: { goal: GoalInsert; milestones: MilestoneDraft[] }) => {
      const created = await insertGoal(goal)
      if (milestones.length) await replaceMilestones(created.id, milestones)
      return created
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY })
      qc.invalidateQueries({ queryKey: ['milestones'] })
    },
  })
}

export function useUpdateGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      patch,
      milestones,
    }: {
      id: string
      patch: Partial<Goal>
      milestones?: MilestoneDraft[]
    }) => {
      await updateGoalApi(id, patch)
      if (milestones) await replaceMilestones(id, milestones)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY })
      qc.invalidateQueries({ queryKey: ['milestones'] })
    },
  })
}

export function useDeleteGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteGoalApi(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useToggleMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => setMilestoneDone(id, done),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['milestones'] }),
  })
}
