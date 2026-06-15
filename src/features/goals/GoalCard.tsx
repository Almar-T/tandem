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
    <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-medium">{goal.title}</h3>
          {goal.description && <p className="mt-0.5 text-xs text-slate-500">{goal.description}</p>}
        </div>
        <div className="flex shrink-0">
          <button onClick={() => onEdit(goal)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300">
            <Pencil size={15} />
          </button>
          <button
            onClick={() => confirm(`Delete goal "${goal.title}"? Linked tasks are kept.`) && remove.mutate(goal.id)}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-red-950 hover:text-red-400"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11px]">
        <span className={cn('rounded px-1.5 py-0.5', pace.badge)}>{pace.label}</span>
        {goal.category && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-400">{goal.category}</span>}
        {goal.target_date && (
          <span className="text-slate-500">
            by {new Date(goal.target_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        )}
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs text-slate-400">
          <span>{progress}%</span>
          <span>
            {linked.filter((t) => t.status === 'completed').length}/{linked.length} tasks
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {milestones.length > 0 && (
        <div className="space-y-1 border-t border-slate-800 pt-2">
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <ListChecks size={12} /> Milestones
          </div>
          {milestones.map((m) => (
            <button
              key={m.id}
              onClick={() => toggle.mutate({ id: m.id, done: !m.done })}
              className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-slate-800"
            >
              {m.done ? (
                <CheckCircle2 size={15} className="shrink-0 text-green-500" />
              ) : (
                <Circle size={15} className="shrink-0 text-slate-600" />
              )}
              <span className={cn(m.done && 'text-slate-500 line-through')}>{m.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
