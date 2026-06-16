import { useState, type FormEvent } from 'react'
import { format } from 'date-fns'
import { useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/auth/AuthProvider'
import { useTasks } from '@/features/tasks/useTasks'
import { supabase } from '@/lib/supabase'

interface Props {
  open: boolean
  onClose: () => void
}

export function ManualHoursModal({ open, onClose }: Props) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const { data: tasks = [] } = useTasks()

  const [hours, setHours] = useState('')
  const [minutes, setMinutes] = useState('')
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [startTime, setStartTime] = useState(() => format(new Date(), 'HH:mm'))
  const [note, setNote] = useState('')
  const [taskId, setTaskId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalSec = (Number(hours || 0) * 3600) + (Number(minutes || 0) * 60)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (totalSec <= 0 || !note.trim()) return
    setBusy(true)
    setError(null)

    const startedAt = new Date(`${date}T${startTime}:00`)
    const endedAt = new Date(startedAt.getTime() + totalSec * 1000)

    const { error: err } = await supabase.from('work_sessions').insert({
      user_id: user?.id,
      task_id: taskId || null,
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      active_sec: 0,
      idle_explained_sec: totalSec,
      idle_unexplained_sec: 0,
      idle_reason: 'other',
      events: { manual: true, note: note.trim() },
    })
    setBusy(false)
    if (err) { setError(err.message); return }
    qc.invalidateQueries({ queryKey: ['work_sessions'] })
    setHours('')
    setMinutes('')
    setDate(format(new Date(), 'yyyy-MM-dd'))
    setStartTime(format(new Date(), 'HH:mm'))
    setNote('')
    setTaskId('')
    onClose()
  }

  const strongEnough = note.trim().length >= 10

  return (
    <Modal open={open} onClose={onClose} title="Log manual hours">
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-xs text-hearth-text/70">
          Time entered here is logged as explained time (shown in yellow) and placed on the correct day in your bar graph.
        </p>

        {/* Date + start time row */}
        <div className="grid grid-cols-2 gap-3">
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
          <div>
            <label className="mb-1 block text-xs font-medium text-hearth-text">Start time</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-lg border border-hearth-border bg-hearth-cream px-3 py-2 text-sm text-hearth-green outline-none focus:border-hearth-gold focus:ring-1 focus:ring-hearth-gold/30"
            />
          </div>
        </div>

        {/* Duration */}
        <div>
          <label className="mb-1 block text-xs font-medium text-hearth-text">Duration</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={23}
              placeholder="0"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="w-20 rounded-lg border border-hearth-border bg-hearth-cream px-3 py-2 text-sm text-hearth-green outline-none focus:border-hearth-gold focus:ring-1 focus:ring-hearth-gold/30"
            />
            <span className="text-sm text-hearth-text">h</span>
            <input
              type="number"
              min={0}
              max={59}
              placeholder="0"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="w-20 rounded-lg border border-hearth-border bg-hearth-cream px-3 py-2 text-sm text-hearth-green outline-none focus:border-hearth-gold focus:ring-1 focus:ring-hearth-gold/30"
            />
            <span className="text-sm text-hearth-text">min</span>
          </div>
        </div>

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

        {!strongEnough && totalSec > 0 && note.trim().length > 0 && (
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
            disabled={busy || totalSec <= 0 || !strongEnough}
          >
            {busy ? 'Logging…' : 'Log time'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
