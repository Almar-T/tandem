import { useEffect, useState, type FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/auth/AuthProvider'
import type { Goal, GoalStatus } from '@/lib/types'
import type { MilestoneDraft } from './api'
import { useCreateGoal, useMilestones, useUpdateGoal } from './useGoals'

const input =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-slate-500'
const labelCls = 'block space-y-1 text-xs font-medium text-slate-400'

const GOAL_STATUSES: { value: GoalStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'achieved', label: 'Achieved' },
  { value: 'paused', label: 'Paused' },
  { value: 'dropped', label: 'Dropped' },
]

export function GoalEditor({
  open,
  onClose,
  goal,
}: {
  open: boolean
  onClose: () => void
  goal?: Goal | null
}) {
  const { user } = useAuth()
  const create = useCreateGoal()
  const update = useUpdateGoal()
  const { data: existing = [] } = useMilestones(goal?.id ?? '')

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [status, setStatus] = useState<GoalStatus>('active')
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([])

  useEffect(() => {
    if (!open) return
    setTitle(goal?.title ?? '')
    setDescription(goal?.description ?? '')
    setCategory(goal?.category ?? '')
    setTargetDate(goal?.target_date ?? '')
    setStatus(goal?.status ?? 'active')
    setMilestones(
      goal
        ? existing.map((m) => ({ title: m.title, target_date: m.target_date, done: m.done }))
        : [],
    )
  }, [open, goal, existing])

  const busy = create.isPending || update.isPending

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const clean = milestones.filter((m) => m.title.trim())
    const patch = {
      title: title.trim(),
      description: description.trim() || null,
      category: category.trim() || null,
      target_date: targetDate || null,
      status,
    }
    if (goal) {
      update.mutate({ id: goal.id, patch, milestones: clean }, { onSuccess: onClose })
    } else {
      create.mutate({ goal: { ...patch, owner_id: user?.id ?? null }, milestones: clean }, { onSuccess: onClose })
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={goal ? 'Edit goal' : 'New goal'}>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className={labelCls}>
          <span>Goal</span>
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Launch the business" autoFocus />
        </label>

        <label className={labelCls}>
          <span>Description</span>
          <textarea className={input} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>
            <span>Category</span>
            <input className={input} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Business" />
          </label>
          <label className={labelCls}>
            <span>Target date</span>
            <input type="date" className={input} value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </label>
        </div>

        {goal && (
          <label className={labelCls}>
            <span>Status</span>
            <select className={input} value={status} onChange={(e) => setStatus(e.target.value as GoalStatus)}>
              {GOAL_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Milestones */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-400">Milestones</div>
          {milestones.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className={`${input} flex-1`}
                value={m.title}
                onChange={(e) =>
                  setMilestones((arr) => arr.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
                }
                placeholder={`Milestone ${i + 1}`}
              />
              <button
                type="button"
                onClick={() => setMilestones((arr) => arr.filter((_, j) => j !== i))}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
              >
                <X size={15} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setMilestones((arr) => [...arr, { title: '', target_date: null, done: false }])}
            className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
          >
            <Plus size={14} /> Add milestone
          </button>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !title.trim()}>
            {busy ? 'Saving…' : goal ? 'Save changes' : 'Create goal'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
