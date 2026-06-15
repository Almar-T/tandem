import { useState } from 'react'
import { Plus, Target } from 'lucide-react'
import type { Goal } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { useTasks } from '@/features/tasks/useTasks'
import { useGoals } from './useGoals'
import { GoalCard } from './GoalCard'
import { GoalEditor } from './GoalEditor'

export function GoalsPage() {
  const { data: goals = [], isLoading } = useGoals()
  const { data: tasks = [] } = useTasks()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)

  const active = goals.filter((g) => g.status === 'active')
  const other = goals.filter((g) => g.status !== 'active')

  function openNew() {
    setEditing(null)
    setOpen(true)
  }
  function openEdit(g: Goal) {
    setEditing(g)
    setOpen(true)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Goals</h1>
        <Button onClick={openNew}>
          <Plus size={16} /> New goal
        </Button>
      </div>

      {!isLoading && goals.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center">
          <Target className="mx-auto mb-2 text-slate-600" />
          <p className="text-sm text-slate-400">No goals yet.</p>
          <p className="mt-1 text-xs text-slate-500">
            Create one, or ask the Planner: “Help me launch my business this month.”
          </p>
        </div>
      )}

      {active.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {active.map((g) => (
            <GoalCard key={g.id} goal={g} tasks={tasks} onEdit={openEdit} />
          ))}
        </div>
      )}

      {other.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-slate-500">Archived</h2>
          <div className="grid gap-3 opacity-70 md:grid-cols-2">
            {other.map((g) => (
              <GoalCard key={g.id} goal={g} tasks={tasks} onEdit={openEdit} />
            ))}
          </div>
        </div>
      )}

      <GoalEditor open={open} onClose={() => setOpen(false)} goal={editing} />
    </div>
  )
}
