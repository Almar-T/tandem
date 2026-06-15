import type { Task, TaskStatus } from '@/lib/types'

/**
 * A task's *effective* status. We only ever store not_started/in_progress/
 * completed; "overdue" is computed live so it's always accurate without a cron.
 */
export function effectiveStatus(t: Task): TaskStatus {
  if (t.status !== 'completed' && t.due_date && new Date(t.due_date).getTime() < Date.now()) {
    return 'overdue'
  }
  return t.status
}

/** ISO string → value for an <input type="datetime-local"> in local time. */
export function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

/** datetime-local value → ISO string (or null when empty). */
export function fromDatetimeLocal(v: string): string | null {
  return v ? new Date(v).toISOString() : null
}

/** 90 → "1h 30m", 45 → "45m". */
export function formatMinutes(min: number | null | undefined): string {
  if (!min) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h && m) return `${h}h ${m}m`
  return h ? `${h}h` : `${m}m`
}

/** "Today 3:00 PM", "Mar 4", "Overdue 2d" style short due-date label. */
export function formatDue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return `Today ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
