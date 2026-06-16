/**
 * Shared domain types. These mirror the Postgres schema in
 * supabase/migrations/0001_init.sql. Once the project is live you can
 * replace these by generating types with `supabase gen types typescript`.
 */

export type TaskStatus = 'not_started' | 'in_progress' | 'completed' | 'overdue'
export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type WorkType = 'deep_work' | 'admin' | 'meeting' | 'creative' | 'study' | 'collab'
export type GoalStatus = 'active' | 'achieved' | 'paused' | 'dropped'
export type IdleReason = 'reading' | 'thinking' | 'bathroom' | 'call' | 'meeting' | 'other'

export interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
  timezone: string
  created_at: string
}

export interface Goal {
  id: string
  title: string
  description: string | null
  category: string | null
  target_date: string | null
  status: GoalStatus
  progress: number
  owner_id: string | null
  created_at: string
}

export interface Milestone {
  id: string
  goal_id: string
  title: string
  target_date: string | null
  done: boolean
  sort_order: number
}

export interface Task {
  id: string
  title: string
  description: string | null
  category: string | null
  work_type: WorkType | null
  priority: Priority
  status: TaskStatus
  due_date: string | null
  show_on_calendar: boolean
  assignee_id: string | null
  goal_id: string | null
  estimate_min: number | null
  actual_min: number | null
  scheduled_start: string | null
  scheduled_end: string | null
  depends_on: string[] | null
  created_by: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface WorkSession {
  id: string
  task_id: string | null
  user_id: string
  started_at: string
  ended_at: string | null
  active_sec: number
  idle_explained_sec: number
  idle_unexplained_sec: number
  idle_reason: IdleReason | null
  events: Record<string, unknown> | null
}

export interface Screenshot {
  id: string
  session_id: string | null
  user_id: string
  storage_path: string
  taken_at: string
  expires_at: string | null
}

export interface Settings {
  user_id: string
  screenshots_enabled: boolean
  screenshot_freq_sec: number
  screenshot_retention_days: number
  idle_threshold_sec: number
  ai_provider: string
  work_hours: Record<string, { start: string; end: string }> | null
}
