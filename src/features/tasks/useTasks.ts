import { useEffect, useId } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  deleteTask,
  fetchTasks,
  insertTask,
  updateTask,
  type TaskInsert,
  type TaskPatch,
} from './api'

const KEY = ['tasks']

/**
 * The master task list. Subscribes to Postgres changes so any edit by either
 * user — from any device — invalidates the cache and re-renders within ~1s.
 */
export function useTasks() {
  const qc = useQueryClient()
  // Unique per hook instance — useTasks runs in several components at once,
  // and Supabase rejects two channels sharing a name.
  const channelId = useId().replace(/[^a-zA-Z0-9]/g, '')

  useEffect(() => {
    const channel = supabase
      .channel(`tasks-changes-${channelId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        () => qc.invalidateQueries({ queryKey: KEY }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [qc, channelId])

  return useQuery({ queryKey: KEY, queryFn: fetchTasks })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TaskInsert) => insertTask(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) => updateTask(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
