import type { Priority, TaskStatus, WorkType } from '@/lib/types'

/** Work types drive the AI planner's scheduling heuristics in later phases. */
export const WORK_TYPES: { value: WorkType; label: string }[] = [
  { value: 'deep_work', label: 'Deep work' },
  { value: 'admin', label: 'Admin' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'creative', label: 'Creative' },
  { value: 'study', label: 'Study' },
  { value: 'collab', label: 'Collaborative' },
]

export const PRIORITIES: { value: Priority; label: string; badge: string }[] = [
  { value: 'low', label: 'Low', badge: 'bg-slate-700 text-slate-300' },
  { value: 'medium', label: 'Medium', badge: 'bg-sky-900 text-sky-300' },
  { value: 'high', label: 'High', badge: 'bg-amber-900 text-amber-300' },
  { value: 'urgent', label: 'Urgent', badge: 'bg-red-900 text-red-300' },
]

/** Statuses the user can set directly. "overdue" is derived, never stored manually. */
export const EDITABLE_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
]

export const STATUS_BADGE: Record<TaskStatus, { label: string; badge: string }> = {
  not_started: { label: 'Not started', badge: 'bg-slate-700 text-slate-300' },
  in_progress: { label: 'In progress', badge: 'bg-indigo-900 text-indigo-300' },
  completed: { label: 'Completed', badge: 'bg-green-900 text-green-300' },
  overdue: { label: 'Overdue', badge: 'bg-red-900 text-red-300' },
}
