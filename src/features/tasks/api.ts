import { supabase } from '@/lib/supabase'
import type { Task } from '@/lib/types'

export type TaskInsert = Partial<Task> & { title: string }
export type TaskPatch = Partial<Task>

export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function insertTask(input: TaskInsert): Promise<Task> {
  const { data, error } = await supabase.from('tasks').insert(input).select('*').single()
  if (error) throw error
  return data as Task
}

export async function updateTask(id: string, patch: TaskPatch): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as Task
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}
