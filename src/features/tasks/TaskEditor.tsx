import { useEffect, useState, type FormEvent } from 'react'
import { Repeat } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/auth/AuthProvider'
import { useProfiles } from '@/features/profiles/useProfiles'
import { useGoals } from '@/features/goals/useGoals'
import type { Priority, Task, TaskStatus, WorkType } from '@/lib/types'
import { EDITABLE_STATUSES, PRIORITIES, WORK_TYPES } from './constants'
import { fromDatetimeLocal, toDatetimeLocal } from './util'
import { useCreateTask, useUpdateTask } from './useTasks'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'

const input =
  'w-full rounded-lg border border-hearth-border bg-hearth-cream px-3 py-2 text-sm text-hearth-green outline-none focus:border-hearth-gold focus:ring-1 focus:ring-hearth-gold/30'
const labelCls = 'block space-y-1 text-xs font-medium text-hearth-text'

interface Props {
  open: boolean
  onClose: () => void
  task?: Task | null
  /** Pre-fill the due date when creating a new task (e.g. clicking a calendar day). */
  defaultDue?: string | null
}

/** Create a new task (task=null) or edit an existing one. */
export function TaskEditor({ open, onClose, task, defaultDue = null }: Props) {
  const { user } = useAuth()
  const { data: profiles = [] } = useProfiles()
  const { data: goals = [] } = useGoals()
  const create = useCreateTask()
  const update = useUpdateTask()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [workType, setWorkType] = useState<WorkType | ''>('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [status, setStatus] = useState<TaskStatus>('not_started')
  const [due, setDue] = useState('')
  const [showOnCalendar, setShowOnCalendar] = useState(false)
  const [assignee, setAssignee] = useState('')
  const [estimate, setEstimate] = useState('')
  const [goalId, setGoalId] = useState('')
  const [recurrence, setRecurrence] = useState<'daily' | 'weekly' | 'monthly' | null>(null)
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([])

  // Re-seed the form whenever the dialog opens (new task vs. a specific task).
  useEffect(() => {
    if (!open) return
    setTitle(task?.title ?? '')
    setDescription(task?.description ?? '')
    setCategory(task?.category ?? '')
    setWorkType(task?.work_type ?? '')
    setPriority(task?.priority ?? 'medium')
    setStatus(task?.status ?? 'not_started')
    setDue(toDatetimeLocal(task?.due_date ?? defaultDue ?? null))
    setShowOnCalendar(task?.show_on_calendar ?? (!task && defaultDue != null))
    setAssignee(task?.assignee_id ?? user?.id ?? '')
    setEstimate(task?.estimate_min ? String(task.estimate_min) : '')
    setGoalId(task?.goal_id ?? '')
    setRecurrence(task?.recurrence ?? null)
    setRecurrenceDays(task?.recurrence_days ?? [])
  }, [open, task, defaultDue, user?.id])

  function handleRecurrenceToggle() {
    if (recurrence) {
      setRecurrence(null)
      setRecurrenceDays([])
    } else {
      setRecurrence('weekly')
      setRecurrenceDays([])
    }
  }

  function handleRecurrenceType(r: 'daily' | 'weekly' | 'monthly') {
    setRecurrence(r)
    if (r === 'monthly') setRecurrenceDays([new Date().getDate()])
    else if (r === 'daily') setRecurrenceDays([])
  }

  function toggleDay(dow: number) {
    setRecurrenceDays((d) => d.includes(dow) ? d.filter((x) => x !== dow) : [...d, dow])
  }

  const busy = create.isPending || update.isPending

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return

    const isRecurring = recurrence !== null
    const fields = {
      title: title.trim(),
      description: description.trim() || null,
      category: category.trim() || null,
      work_type: workType || null,
      priority,
      status,
      due_date: isRecurring ? null : fromDatetimeLocal(due),
      show_on_calendar: showOnCalendar,
      assignee_id: assignee || null,
      estimate_min: estimate ? Number(estimate) : null,
      goal_id: goalId || null,
      recurrence: recurrence ?? null,
      recurrence_days: recurrenceDays,
      is_template: isRecurring,
    }

    if (task) {
      update.mutate({ id: task.id, patch: fields }, {
        onSuccess: async () => {
          if (isRecurring) await supabase.rpc('spawn_recurring_tasks')
          onClose()
        },
      })
    } else {
      create.mutate({ ...fields, created_by: user?.id ?? null }, {
        onSuccess: async () => {
          if (isRecurring) await supabase.rpc('spawn_recurring_tasks')
          onClose()
        },
      })
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={task ? 'Edit task' : 'New task'}>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className={labelCls}>
          <span>Task name</span>
          <input
            className={input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing?"
            autoFocus
          />
        </label>

        <label className={labelCls}>
          <span>Description</span>
          <textarea
            className={input}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>
            <span>Category</span>
            <input
              className={input}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Marketing"
            />
          </label>
          <label className={labelCls}>
            <span>Work type</span>
            <select
              className={input}
              value={workType}
              onChange={(e) => setWorkType(e.target.value as WorkType | '')}
            >
              <option value="">—</option>
              {WORK_TYPES.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>
            <span>Priority</span>
            <select
              className={input}
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            <span>Status</span>
            <select
              className={input}
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
            >
              {EDITABLE_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>
            <span>Due date</span>
            <input
              type="datetime-local"
              className={input}
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </label>
          <label className={labelCls}>
            <span>Estimate (minutes)</span>
            <input
              type="number"
              min={0}
              step={5}
              className={input}
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
              placeholder="e.g. 60"
            />
          </label>
        </div>

        <label className="flex items-center gap-2.5 rounded-lg border border-hearth-border bg-hearth-muted px-3 py-2.5">
          <input
            type="checkbox"
            checked={showOnCalendar}
            onChange={(e) => setShowOnCalendar(e.target.checked)}
            className="h-4 w-4 accent-hearth-green"
          />
          <span className="text-sm text-hearth-green">
            Show on calendar
            <span className="ml-1 text-xs text-hearth-text/60">— uses the due date as the event time</span>
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>
            <span>Assigned to</span>
            <select
              className={input}
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              <option value="">Unassigned</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            <span>Goal</span>
            <select className={input} value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              <option value="">None</option>
              {goals
                .filter((g) => g.status === 'active')
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
            </select>
          </label>
        </div>

        {/* ── Repeat ── */}
        <div className="rounded-lg border border-hearth-border bg-hearth-muted p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-hearth-green">
              <Repeat size={14} className="text-hearth-text/50" />
              Repeat this task
            </div>
            <button
              type="button"
              onClick={handleRecurrenceToggle}
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
                recurrence ? 'bg-hearth-green' : 'bg-hearth-border',
              )}
            >
              <span className={cn(
                'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                recurrence ? 'translate-x-[18px]' : 'translate-x-0.5',
              )} />
            </button>
          </div>

          {recurrence && (
            <div className="space-y-3">
              {/* Frequency selector */}
              <div className="flex gap-2">
                {(['daily', 'weekly', 'monthly'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handleRecurrenceType(r)}
                    className={cn(
                      'flex-1 rounded-lg py-1.5 text-xs font-medium capitalize transition',
                      recurrence === r
                        ? 'bg-hearth-green text-hearth-cream shadow-sm'
                        : 'border border-hearth-border bg-white/70 text-hearth-text hover:border-hearth-gold',
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>

              {/* Day picker for weekly */}
              {recurrence === 'weekly' && (
                <div className="flex gap-1">
                  {[
                    { dow: 1, label: 'Mo' },
                    { dow: 2, label: 'Tu' },
                    { dow: 3, label: 'We' },
                    { dow: 4, label: 'Th' },
                    { dow: 5, label: 'Fr' },
                    { dow: 6, label: 'Sa' },
                    { dow: 7, label: 'Su' },
                  ].map(({ dow, label }) => (
                    <button
                      key={dow}
                      type="button"
                      onClick={() => toggleDay(dow)}
                      className={cn(
                        'flex-1 rounded-md py-1 text-xs font-medium transition',
                        recurrenceDays.includes(dow)
                          ? 'bg-hearth-green text-hearth-cream'
                          : 'border border-hearth-border bg-white/70 text-hearth-text hover:border-hearth-gold',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {recurrence === 'monthly' && (
                <p className="text-xs text-hearth-text/60">
                  Repeats on day {recurrenceDays[0] ?? new Date().getDate()} of each month.
                </p>
              )}

              {recurrence === 'daily' && (
                <p className="text-xs text-hearth-text/60">A new instance will appear every morning.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !title.trim()}>
            {busy ? 'Saving…' : task ? 'Save changes' : 'Create task'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
