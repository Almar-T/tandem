import { useMemo, useState } from 'react'
import { Plus, Repeat } from 'lucide-react'
import type { Task } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { useProfiles } from '@/features/profiles/useProfiles'
import { useTasks } from './useTasks'
import { TaskRow } from './TaskRow'
import { TaskEditor } from './TaskEditor'
import { FilterBar, EMPTY_FILTERS, type Filters } from './FilterBar'
import { effectiveStatus } from './util'
import { DayCalendar } from '@/features/dashboard/DayCalendar'

export function TasksPage() {
  const { data: tasks = [], isLoading, isError } = useTasks()
  const { data: profiles = [] } = useProfiles()

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)

  const templates = useMemo(() => tasks.filter((t) => t.is_template), [tasks])
  const regularTasks = useMemo(() => tasks.filter((t) => !t.is_template), [tasks])

  const categories = useMemo(
    () => [...new Set(regularTasks.map((t) => t.category).filter(Boolean) as string[])].sort(),
    [regularTasks],
  )

  const visible = useMemo(() => {
    const q = filters.search.toLowerCase()
    return regularTasks.filter((t) => {
      if (filters.assignee && t.assignee_id !== filters.assignee) return false
      if (filters.category && t.category !== filters.category) return false
      if (filters.priority && t.priority !== filters.priority) return false
      if (filters.status && effectiveStatus(t) !== filters.status) return false
      if (q && !t.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [regularTasks, filters])

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
      {/* Plan for the Day — two-column day calendar */}
      <DayCalendar profiles={profiles} />

      {/* Recurring templates */}
      {templates.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Repeat size={14} className="text-hearth-gold" />
            <h2 className="text-xs font-semibold uppercase tracking-widest text-hearth-text/50">
              Recurring
            </h2>
          </div>
          <div className="rounded-2xl border border-hearth-border bg-white/40">
            {templates.map((task) => (
              <TaskRow key={task.id} task={task} profiles={profiles} onEdit={openEdit} />
            ))}
          </div>
        </div>
      )}

      {/* Regular tasks */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-hearth-green">Tasks</h1>
          <p className="text-sm text-hearth-text/60">
            {visible.length} of {regularTasks.length}{' '}
            {regularTasks.length === 1 ? 'task' : 'tasks'} · shared, live-synced
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

      <div className="rounded-2xl border border-hearth-border bg-white/40">
        {isLoading && <p className="p-6 text-sm text-hearth-text/50">Loading tasks…</p>}
        {isError && (
          <p className="p-6 text-sm text-red-600">
            Couldn't load tasks. Check your Supabase connection.
          </p>
        )}
        {!isLoading && !isError && visible.length === 0 && (
          <div className="p-10 text-center text-sm text-hearth-text/50">
            {regularTasks.length === 0
              ? 'No tasks yet — create your first one.'
              : 'No tasks match these filters.'}
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
