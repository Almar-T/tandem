import type { ReactNode } from 'react'
import { isToday } from '@/lib/dates'
import { AlertTriangle, CalendarClock, CheckCircle2, Sparkles } from 'lucide-react'
import type { Task } from '@/lib/types'
import { cn } from '@/lib/cn'
import { effectiveStatus, formatDue } from '@/features/tasks/util'

interface Props {
  tasks: Task[]
  onSelectTask: (t: Task) => void
}

export function TodayPanel({ tasks, onSelectTask }: Props) {
  const dueToday = tasks.filter(
    (t) => t.status !== 'completed' && t.due_date && isToday(new Date(t.due_date)),
  )
  const overdue = tasks.filter((t) => effectiveStatus(t) === 'overdue')
  const completedToday = tasks.filter(
    (t) => t.status === 'completed' && t.completed_at && isToday(new Date(t.completed_at)),
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat icon={<CalendarClock size={15} />} label="Due today" value={dueToday.length} tone="text-sky-400" />
        <Stat icon={<AlertTriangle size={15} />} label="Overdue" value={overdue.length} tone="text-red-400" />
        <Stat icon={<CheckCircle2 size={15} />} label="Done today" value={completedToday.length} tone="text-green-400" />
      </div>

      <Section title="Due today" tasks={dueToday} onSelectTask={onSelectTask} empty="Nothing due today." />
      {overdue.length > 0 && (
        <Section title="Overdue" tasks={overdue} onSelectTask={onSelectTask} danger />
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-300">
          <Sparkles size={15} className="text-indigo-400" /> AI recommends
        </div>
        <p className="text-sm text-slate-500">
          Your AI productivity coach plugs in here in Phase 3 — daily planning, problem-spotting,
          and next-best actions.
        </p>
      </div>
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode
  label: string
  value: number
  tone: string
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-center">
      <div className={cn('flex items-center justify-center', tone)}>{icon}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  )
}

function Section({
  title,
  tasks,
  onSelectTask,
  empty,
  danger,
}: {
  title: string
  tasks: Task[]
  onSelectTask: (t: Task) => void
  empty?: string
  danger?: boolean
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className={cn('mb-2 text-sm font-medium', danger ? 'text-red-400' : 'text-slate-300')}>
        {title}
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {tasks.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => onSelectTask(t)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-800"
              >
                <span className="truncate">{t.title}</span>
                {t.due_date && (
                  <span className="ml-2 shrink-0 text-xs text-slate-500">
                    {formatDue(t.due_date)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
