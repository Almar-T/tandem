import { Target } from 'lucide-react'
import type { Goal, Task } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useGoals } from './useGoals'
import { goalPace, goalProgress, PACE_LABEL } from './goalProgress'

/** Always-visible reminder of what you're working toward (per the spec). */
export function GoalsBar({ tasks }: { tasks: Task[] }) {
  const { data: goals = [] } = useGoals()
  const active = goals.filter((g) => g.status === 'active')

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-300">
        <Target size={16} className="text-indigo-400" />
        Goals
      </div>

      {active.length === 0 ? (
        <p className="text-sm text-slate-500">
          No goals yet. Create one on the Goals tab, or ask the Planner to break a big one down.
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {active.map((g) => (
            <GoalChip key={g.id} goal={g} tasks={tasks} />
          ))}
        </div>
      )}
    </section>
  )
}

function GoalChip({ goal, tasks }: { goal: Goal; tasks: Task[] }) {
  const pct = goalProgress(goal, tasks)
  const pace = PACE_LABEL[goalPace(goal, pct)]
  return (
    <div className="min-w-[210px] flex-1 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-sm font-medium">{goal.title}</div>
        <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px]', pace.badge)}>{pace.label}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-slate-500">
        <span>{pct}%</span>
        {goal.target_date && (
          <span>{new Date(goal.target_date).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
        )}
      </div>
    </div>
  )
}
