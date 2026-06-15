import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/auth/AuthProvider'
import { useProfiles } from '@/features/profiles/useProfiles'
import type { Priority, Task, TaskStatus, WorkType } from '@/lib/types'
import { EDITABLE_STATUSES, PRIORITIES, WORK_TYPES } from './constants'
import { fromDatetimeLocal, toDatetimeLocal } from './util'
import { useCreateTask, useUpdateTask } from './useTasks'

const input =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-slate-500'
const labelCls = 'block space-y-1 text-xs font-medium text-slate-400'

interface Props {
  open: boolean
  onClose: () => void
  task?: Task | null
}

/** Create a new task (task=null) or edit an existing one. */
export function TaskEditor({ open, onClose, task }: Props) {
  const { user } = useAuth()
  const { data: profiles = [] } = useProfiles()
  const create = useCreateTask()
  const update = useUpdateTask()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [workType, setWorkType] = useState<WorkType | ''>('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [status, setStatus] = useState<TaskStatus>('not_started')
  const [due, setDue] = useState('')
  const [assignee, setAssignee] = useState('')
  const [estimate, setEstimate] = useState('')

  // Re-seed the form whenever the dialog opens (new task vs. a specific task).
  useEffect(() => {
    if (!open) return
    setTitle(task?.title ?? '')
    setDescription(task?.description ?? '')
    setCategory(task?.category ?? '')
    setWorkType(task?.work_type ?? '')
    setPriority(task?.priority ?? 'medium')
    setStatus(task?.status ?? 'not_started')
    setDue(toDatetimeLocal(task?.due_date ?? null))
    setAssignee(task?.assignee_id ?? user?.id ?? '')
    setEstimate(task?.estimate_min ? String(task.estimate_min) : '')
  }, [open, task, user?.id])

  const busy = create.isPending || update.isPending

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return

    const fields = {
      title: title.trim(),
      description: description.trim() || null,
      category: category.trim() || null,
      work_type: workType || null,
      priority,
      status,
      due_date: fromDatetimeLocal(due),
      assignee_id: assignee || null,
      estimate_min: estimate ? Number(estimate) : null,
    }

    if (task) {
      update.mutate({ id: task.id, patch: fields }, { onSuccess: onClose })
    } else {
      create.mutate({ ...fields, created_by: user?.id ?? null }, { onSuccess: onClose })
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
