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
        <h1 className="font-serif text-2xl font-semibold text-hearth-green">Goals</h1>
        <Button onClick={openNew}>
          <Plus size={16} /> New goal
        </Button>
      </div>

      {!isLoading && goals.length === 0 && (
        <div className="rounded-2xl border border-dashed border-hearth-border bg-hearth-muted p-10 text-center">
          <Target className="mx-auto mb-2 text-hearth-gold" />
          <p className="text-sm text-hearth-text">No goals yet.</p>
          <p className="mt-1 text-xs text-hearth-text">
            Create one, or ask Vera to help you plan.
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
          <h2 className="text-sm font-medium text-hearth-text">Archived</h2>
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
