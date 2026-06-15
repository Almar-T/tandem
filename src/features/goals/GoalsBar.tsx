import { Target } from 'lucide-react'
import type { Goal } from '@/lib/types'
import { useGoals } from './useGoals'

/** Always-visible reminder of what you're working toward (per the spec). */
export function GoalsBar() {
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
          No goals yet. Goal tracking — with AI breakdown into tasks — arrives in Phase 4.
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {active.map((g) => (
            <GoalChip key={g.id} goal={g} />
          ))}
        </div>
      )}
    </section>
  )
}

function GoalChip({ goal }: { goal: Goal }) {
  const pct = Math.round(goal.progress)
  return (
    <div className="min-w-[200px] flex-1 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
      <div className="truncate text-sm font-medium">{goal.title}</div>
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
