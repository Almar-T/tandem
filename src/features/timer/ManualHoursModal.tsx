import { useState, useMemo, type FormEvent } from 'react'
import { format, isSameDay } from '@/lib/dates'
import { useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/auth/AuthProvider'
import { useTasks } from '@/features/tasks/useTasks'
import { useWorkSessions } from '@/features/analytics/useWorkSessions'
import { supabase } from '@/lib/supabase'
import type { WorkSession } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
}

function parseTimeOnDate(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`)
}

function calcOverlapSec(rangeStart: Date, rangeEnd: Date, sessions: WorkSession[]): number {
  let total = 0
  for (const s of sessions) {
    if (!s.ended_at || s.active_sec <= 0) continue
    const sStart = new Date(s.started_at)
    const sEnd = new Date(s.ended_at)
    const overlapStart = Math.max(rangeStart.getTime(), sStart.getTime())
    const overlapEnd = Math.min(rangeEnd.getTime(), sEnd.getTime())
    if (overlapEnd <= overlapStart) continue
    const wallMs = sEnd.getTime() - sStart.getTime()
    if (wallMs <= 0) continue
    const overlapMs = overlapEnd - overlapStart
    total += Math.round(s.active_sec * (overlapMs / wallMs))
  }
  return total
}

function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  if (m > 0) return `${m}m`
  return '< 1m'
}

export function ManualHoursModal({ open, onClose }: Props) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const { data: tasks = [] } = useTasks()
  const { data: allSessions = [] } = useWorkSessions()

  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [startTime, setStartTime] = useState(() => format(new Date(), 'HH:mm'))
  const [endTime, setEndTime] = useState(() => {
    const d = new Date()
    d.setHours(d.getHours() + 1)
    return format(d, 'HH:mm')
  })
  const [note, setNote] = useState('')
  const [taskId, setTaskId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rangeStart = parseTimeOnDate(date, startTime)
  const rangeEnd = parseTimeOnDate(date, endTime)
  const totalSec = rangeEnd > rangeStart
    ? Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 1000)
    : 0

  const existingOverlapSec = useMemo(() => {
    const start = parseTimeOnDate(date, startTime)
    const end = parseTimeOnDate(date, endTime)
    if (end <= start) return 0
    const daySessions = allSessions.filter(
      (s) => s.user_id === user?.id && isSameDay(new Date(s.started_at), start),
    )
    return calcOverlapSec(start, end, daySessions)
  }, [allSessions, date, startTime, endTime, user?.id])

  const netSec = Math.max(0, totalSec - existingOverlapSec)
  const rangeValid = totalSec > 0
  const strongEnough = note.trim().length >= 10

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (netSec <= 0 || !strongEnough) return
    setBusy(true)
    setError(null)

    const { error: err } = await supabase.from('work_sessions').insert({
      user_id: user?.id,
      task_id: taskId || null,
      started_at: rangeStart.toISOString(),
      ended_at: rangeEnd.toISOString(),
      active_sec: 0,
      idle_explained_sec: netSec,
      idle_unexplained_sec: 0,
      idle_reason: 'other',
      events: { manual: true, note: note.trim() },
    })
    setBusy(false)
    if (err) { setError(err.message); return }
    qc.invalidateQueries({ queryKey: ['work_sessions'] })
    setDate(format(new Date(), 'yyyy-MM-dd'))
    const now = new Date()
    setStartTime(format(now, 'HH:mm'))
    const later = new Date(now)
    later.setHours(later.getHours() + 1)
    setEndTime(format(later, 'HH:mm'))
    setNote('')
    setTaskId('')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Log manual hours">
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-xs text-hearth-text/70">
          Time entered here is logged as explained time (shown in yellow) and placed on the correct day in your bar graph.
        </p>

        {/* Date */}
        <div>
          <label className="mb-1 block text-xs font-medium text-hearth-text">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={format(new Date(), 'yyyy-MM-dd')}
            className="w-full rounded-lg border border-hearth-border bg-hearth-cream px-3 py-2 text-sm text-hearth-green outline-none focus:border-hearth-gold focus:ring-1 focus:ring-hearth-gold/30"
          />
        </div>

        {/* Time range */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-hearth-text">Start time</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-lg border border-hearth-border bg-hearth-cream px-3 py-2 text-sm text-hearth-green outline-none focus:border-hearth-gold focus:ring-1 focus:ring-hearth-gold/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-hearth-text">End time</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full rounded-lg border border-hearth-border bg-hearth-cream px-3 py-2 text-sm text-hearth-green outline-none focus:border-hearth-gold focus:ring-1 focus:ring-hearth-gold/30"
            />
          </div>
        </div>

        {/* Duration summary */}
        {!rangeValid && startTime && endTime && (
          <p className="text-xs text-red-500">End time must be after start time.</p>
        )}

        {rangeValid && (
          <div className="rounded-lg border border-hearth-border/40 bg-hearth-muted px-3 py-2 text-xs text-hearth-text/70">
            {fmtDur(totalSec)} window
            {existingOverlapSec > 0 && netSec > 0 && (
              <>
                {' · '}
                <span className="text-hearth-gold">
                  {Math.round(existingOverlapSec / 60)}min already tracked — logging {fmtDur(netSec)} net
                </span>
              </>
            )}
            {netSec === 0 && existingOverlapSec > 0 && (
              <>
                {' · '}
                <span className="text-red-500">
                  fully covered by existing sessions — nothing new to log
                </span>
              </>
            )}
          </div>
        )}

        {/* Note */}
        <label className="block space-y-1">
          <span className="text-xs font-medium text-hearth-text">
            What were you doing?{' '}
            <span className={note.trim().length > 0 && !strongEnough ? 'text-hearth-gold' : 'text-hearth-text/50'}>
              (10+ chars to count as explained)
            </span>
          </span>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Deep work on proposal draft, no timer running"
            className="w-full rounded-lg border border-hearth-border bg-hearth-cream px-3 py-2 text-sm text-hearth-green outline-none focus:border-hearth-gold focus:ring-1 focus:ring-hearth-gold/30"
          />
        </label>

        {/* Task link */}
        <label className="block space-y-1">
          <span className="text-xs font-medium text-hearth-text">Link to task (optional)</span>
          <select
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            className="w-full rounded-lg border border-hearth-border bg-hearth-cream px-3 py-2 text-sm text-hearth-green outline-none focus:border-hearth-gold focus:ring-1 focus:ring-hearth-gold/30"
          >
            <option value="">None</option>
            {tasks
              .filter((t) => t.status !== 'completed')
              .map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
          </select>
        </label>

        {!strongEnough && netSec > 0 && note.trim().length > 0 && (
          <p className="rounded-lg border border-hearth-gold/40 bg-hearth-gold/10 px-3 py-2 text-xs text-hearth-text">
            Description is too short — add more detail for this to log as explained time.
          </p>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            variant="gold"
            disabled={busy || netSec <= 0 || !strongEnough}
          >
            {busy ? 'Logging…' : 'Log time'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
