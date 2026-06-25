import { useMemo, useState } from 'react'
import { CheckCheck, ChevronDown, ChevronUp, Clock, Plus, Repeat } from 'lucide-react'
import type { Task } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { useProfiles } from '@/features/profiles/useProfiles'
import { useTasks } from './useTasks'
import { TaskRow } from './TaskRow'
import { TaskEditor } from './TaskEditor'
import { FilterBar, EMPTY_FILTERS, type Filters } from './FilterBar'
import { effectiveStatus } from './util'
import { DayCalendar } from '@/features/dashboard/DayCalendar'

function daysUntilDelete(completedAt: string | null): number {
  if (!completedAt) return 7
  const msLeft = 7 * 24 * 60 * 60 * 1000 - (Date.now() - new Date(completedAt).getTime())
  return Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)))
}

export function TasksPage() {
  const { data: tasks = [], isLoading, isError } = useTasks()
  const { data: profiles = [] } = useProfiles()

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [completedExpanded, setCompletedExpanded] = useState(true)

  const templates    = useMemo(() => tasks.filter((t) =>  t.is_template), [tasks])
  const regularTasks = useMemo(() => tasks.filter((t) => !t.is_template), [tasks])
  const activeTasks  = useMemo(() => regularTasks.filter((t) => t.status !== 'completed'), [regularTasks])
  const doneTasks    = useMemo(
    () => regularTasks
      .filter((t) => t.status === 'completed')
      .sort((a, b) => new Date(b.completed_at ?? b.updated_at).getTime() - new Date(a.completed_at ?? a.updated_at).getTime()),
    [regularTasks],
  )

  const categories = useMemo(
    () => [...new Set(activeTasks.map((t) => t.category).filter(Boolean) as string[])].sort(),
    [activeTasks],
  )

  const visibleActive = useMemo(() => {
    const q = filters.search.toLowerCase()
    return activeTasks.filter((t) => {
      if (filters.assignee && t.assignee_id !== filters.assignee) return false
      if (filters.category && t.category !== filters.category) return false
      if (filters.priority && t.priority !== filters.priority) return false
      if (filters.status && effectiveStatus(t) !== filters.status) return false
      if (q && !t.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [activeTasks, filters])

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

      {/* Active tasks */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-hearth-green">Tasks</h1>
          <p className="text-sm text-hearth-text/60">
            {visibleActive.length} of {activeTasks.length}{' '}
            {activeTasks.length === 1 ? 'task' : 'tasks'} · shared, live-synced
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
        {!isLoading && !isError && visibleActive.length === 0 && (
          <div className="p-10 text-center text-sm text-hearth-text/50">
            {activeTasks.length === 0
              ? 'No active tasks — create your first one.'
              : 'No tasks match these filters.'}
          </div>
        )}
        {visibleActive.map((task) => (
          <TaskRow key={task.id} task={task} profiles={profiles} onEdit={openEdit} />
        ))}
      </div>

      {/* Completed tasks */}
      {doneTasks.length > 0 && (
        <div>
          <button
            onClick={() => setCompletedExpanded((v) => !v)}
            className="mb-2 flex w-full items-center gap-2 text-left"
          >
            <CheckCheck size={14} className="text-productive" />
            <h2 className="text-xs font-semibold uppercase tracking-widest text-hearth-text/50">
              Completed ({doneTasks.length})
            </h2>
            <span className="ml-auto text-hearth-text/30">
              {completedExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </button>

          {completedExpanded && (
            <div className="rounded-2xl border border-hearth-border bg-white/40">
              {doneTasks.map((task) => {
                const days = daysUntilDelete(task.completed_at)
                return (
                  <div key={task.id} className="relative">
                    <TaskRow task={task} profiles={profiles} onEdit={openEdit} />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded-full bg-hearth-muted px-2 py-0.5 text-[10px] text-hearth-text/40 pointer-events-none">
                      <Clock size={9} />
                      {days === 0 ? 'deletes today' : `deletes in ${days}d`}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <TaskEditor open={editorOpen} onClose={() => setEditorOpen(false)} task={editing} />
    </div>
  )
}
