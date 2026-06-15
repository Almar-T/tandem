import { useState } from 'react'
import type { Task } from '@/lib/types'

/**
 * Shared editor state so any page (dashboard, calendar, tasks) can open the
 * same TaskEditor for a new task (optionally pre-dated) or an existing one.
 */
export function useTaskEditor() {
  const [open, setOpen] = useState(false)
  const [task, setTask] = useState<Task | null>(null)
  const [defaultDue, setDefaultDue] = useState<string | null>(null)

  return {
    open,
    task,
    defaultDue,
    openNew(due?: string | null) {
      setTask(null)
      setDefaultDue(due ?? null)
      setOpen(true)
    },
    openEdit(t: Task) {
      setTask(t)
      setDefaultDue(null)
      setOpen(true)
    },
    close() {
      setOpen(false)
    },
  }
}
