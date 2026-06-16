import { CalendarDays, Check, Pencil, Play, Square, Trash2 } from 'lucide-react'
import type { Profile, Task } from '@/lib/types'
import { cn } from '@/lib/cn'
import { initialOf } from '@/features/profiles/useProfiles'
import { useTimer } from '@/features/timer/TimerProvider'
import { PRIORITIES, STATUS_BADGE } from './constants'
import { effectiveStatus, formatDue, formatMinutes } from './util'
import { useDeleteTask, useUpdateTask } from './useTasks'

interface Props {
  task: Task
  profiles: Profile[]
  onEdit: (task: Task) => void
}

export function TaskRow({ task, profiles, onEdit }: Props) {
  const update = useUpdateTask()
  const remove = useDeleteTask()
  const timer = useTimer()
  const isTiming = timer.task?.id === task.id

  const status = effectiveStatus(task)
  const done = task.status === 'completed'
  const priority = PRIORITIES.find((p) => p.value === task.priority)
  const assignee = profiles.find((p) => p.id === task.assignee_id)

  function toggleDone() {
    update.mutate({
      id: task.id,
      patch: { status: done ? 'in_progress' : 'completed' },
    })
  }

  return (
    <div className="flex items-center gap-3 border-b border-hearth-border/60 px-2 py-2.5 hover:bg-hearth-muted/40">
      {/* Complete toggle */}
      <button
        onClick={toggleDone}
        className={cn(
          'grid h-5 w-5 shrink-0 place-items-center rounded-md border transition',
          done
            ? 'border-productive bg-productive text-white'
            : 'border-hearth-border text-transparent hover:border-hearth-gold',
        )}
        title={done ? 'Mark incomplete' : 'Mark complete'}
      >
        <Check size={14} />
      </button>

      {/* Title + meta */}
      <button onClick={() => onEdit(task)} className="min-w-0 flex-1 text-left">
        <div className={cn('truncate text-sm text-hearth-green', done && 'text-hearth-text/40 line-through')}>
          {task.title}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className={cn('rounded px-1.5 py-0.5', STATUS_BADGE[status].badge)}>
            {STATUS_BADGE[status].label}
          </span>
          {priority && (
            <span className={cn('rounded px-1.5 py-0.5', priority.badge)}>{priority.label}</span>
          )}
          {task.category && (
            <span className="rounded bg-hearth-muted px-1.5 py-0.5 text-hearth-text">
              {task.category}
            </span>
          )}
          {task.estimate_min ? (
            <span className="text-hearth-text/50">~{formatMinutes(task.estimate_min)}</span>
          ) : null}
          {task.due_date && (
            <span className={cn(status === 'overdue' ? 'text-red-600' : 'text-hearth-text/50')}>
              {formatDue(task.due_date)}
            </span>
          )}
          {task.show_on_calendar && (
            <CalendarDays size={12} className="text-hearth-gold" aria-label="On calendar" />
          )}
        </div>
      </button>

      {/* Assignee avatar */}
      <div
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-hearth-green text-xs font-medium text-hearth-cream"
        title={assignee?.display_name ?? 'Unassigned'}
      >
        {assignee ? initialOf(assignee.display_name) : '–'}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center">
        {!done && (
          <button
            onClick={() => (isTiming ? timer.stop() : timer.start(task))}
            className={cn(
              'rounded-lg p-1.5 transition',
              isTiming
                ? 'text-productive hover:bg-hearth-muted'
                : 'text-hearth-text/50 hover:bg-hearth-muted hover:text-hearth-green',
            )}
            title={isTiming ? 'Stop timer' : 'Start timer'}
          >
            {isTiming ? <Square size={15} /> : <Play size={15} />}
          </button>
        )}
        <button
          onClick={() => onEdit(task)}
          className="rounded-lg p-1.5 text-hearth-text/50 transition hover:bg-hearth-muted hover:text-hearth-green"
          title="Edit"
        >
          <Pencil size={15} />
        </button>
        <button
          onClick={() => {
            if (confirm(`Delete "${task.title}"?`)) remove.mutate(task.id)
          }}
          className="rounded-lg p-1.5 text-hearth-text/50 transition hover:bg-red-50 hover:text-red-600"
          title="Delete"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}
