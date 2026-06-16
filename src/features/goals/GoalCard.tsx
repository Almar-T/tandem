import { CheckCircle2, Circle, ListChecks, Pencil, Trash2 } from 'lucide-react'
import type { Goal, Task } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useDeleteGoal, useMilestones, useToggleMilestone } from './useGoals'
import { goalPace, goalProgress, PACE_LABEL } from './goalProgress'

interface Props {
  goal: Goal
  tasks: Task[]
  onEdit: (g: Goal) => void
}

export function GoalCard({ goal, tasks, onEdit }: Props) {
  const { data: milestones = [] } = useMilestones(goal.id)
  const toggle = useToggleMilestone()
  const remove = useDeleteGoal()

  const linked = tasks.filter((t) => t.goal_id === goal.id)
  const progress = goalProgress(goal, tasks)
  const pace = PACE_LABEL[goalPace(goal, progress)]

  return (
    <div className="space-y-3 rounded-2xl border border-hearth-border bg-white/50 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-serif font-medium text-hearth-green">{goal.title}</h3>
          {goal.description && <p className="mt-0.5 text-xs text-hearth-text/60">{goal.description}</p>}
        </div>
        <div className="flex shrink-0">
          <button onClick={() => onEdit(goal)} className="rounded-lg p-1.5 text-hearth-text/50 hover:bg-hearth-muted hover:text-hearth-green">
            <Pencil size={15} />
          </button>
          <button
            onClick={() => confirm(`Delete goal "${goal.title}"? Linked tasks are kept.`) && remove.mutate(goal.id)}
            className="rounded-lg p-1.5 text-hearth-text/50 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11px]">
        <span className={cn('rounded px-1.5 py-0.5', pace.badge)}>{pace.label}</span>
        {goal.category && <span className="rounded bg-hearth-muted px-1.5 py-0.5 text-hearth-text">{goal.category}</span>}
        {goal.target_date && (
          <span className="text-hearth-text/50">
            by {new Date(goal.target_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        )}
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs text-hearth-text/60">
          <span>{progress}%</span>
          <span>
            {linked.filter((t) => t.status === 'completed').length}/{linked.length} tasks
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-hearth-muted">
          <div className="h-full rounded-full bg-hearth-gold transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {milestones.length > 0 && (
        <div className="space-y-1 border-t border-hearth-border pt-2">
          <div className="flex items-center gap-1 text-[11px] text-hearth-text/50">
            <ListChecks size={12} /> Milestones
          </div>
          {milestones.map((m) => (
            <button
              key={m.id}
              onClick={() => toggle.mutate({ id: m.id, done: !m.done })}
              className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-hearth-muted"
            >
              {m.done ? (
                <CheckCircle2 size={15} className="shrink-0 text-productive" />
              ) : (
                <Circle size={15} className="shrink-0 text-hearth-border" />
              )}
              <span className={cn(m.done && 'text-hearth-text/40 line-through')}>{m.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
