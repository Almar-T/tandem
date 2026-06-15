import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { Task } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { useProfiles } from '@/features/profiles/useProfiles'
import { useTasks } from './useTasks'
import { TaskRow } from './TaskRow'
import { TaskEditor } from './TaskEditor'
import { FilterBar, EMPTY_FILTERS, type Filters } from './FilterBar'
import { effectiveStatus } from './util'

export function TasksPage() {
  const { data: tasks = [], isLoading, isError } = useTasks()
  const { data: profiles = [] } = useProfiles()

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)

  const categories = useMemo(
    () => [...new Set(tasks.map((t) => t.category).filter(Boolean) as string[])].sort(),
    [tasks],
  )

  const visible = useMemo(() => {
    const q = filters.search.toLowerCase()
    return tasks.filter((t) => {
      if (filters.assignee && t.assignee_id !== filters.assignee) return false
      if (filters.category && t.category !== filters.category) return false
      if (filters.priority && t.priority !== filters.priority) return false
      if (filters.status && effectiveStatus(t) !== filters.status) return false
      if (q && !t.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [tasks, filters])

  function openNew() {
    setEditing(null)
    setEditorOpen(true)
  }
  function openEdit(task: Task) {
    setEditing(task)
    setEditorOpen(true)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Tasks</h1>
          <p className="text-sm text-slate-500">
            {visible.length} of {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'} · shared,
            live-synced
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus size={16} /> New task
        </Button>
      </div>

      <FilterBar
        profiles={profiles}
        categories={categories}
        filters={filters}
        onChange={setFilters}
      />

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40">
        {isLoading && <p className="p-6 text-sm text-slate-500">Loading tasks…</p>}
        {isError && (
          <p className="p-6 text-sm text-red-400">
            Couldn't load tasks. Check your Supabase connection.
          </p>
        )}
        {!isLoading && !isError && visible.length === 0 && (
          <div className="p-10 text-center text-sm text-slate-500">
            {tasks.length === 0 ? 'No tasks yet — create your first one.' : 'No tasks match these filters.'}
          </div>
        )}
        {visible.map((task) => (
          <TaskRow key={task.id} task={task} profiles={profiles} onEdit={openEdit} />
        ))}
      </div>

      <TaskEditor open={editorOpen} onClose={() => setEditorOpen(false)} task={editing} />
    </div>
  )
}
