import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import type { Profile, Task, WorkSession } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useProfiles } from '@/features/profiles/useProfiles'
import { useTasks } from '@/features/tasks/useTasks'
import { useWorkSessions } from './useWorkSessions'
import { dailyActive, filterRange, formatHours, totalsFor, type Range } from './analytics'

const USER_BAR = ['bg-indigo-500', 'bg-emerald-500']
const USER_DOT = ['text-indigo-400', 'text-emerald-400']

const RANGES: { value: Range; label: string }[] = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 0, label: 'All time' },
]

export function AnalyticsPage() {
  const { data: sessions = [], isLoading } = useWorkSessions()
  const { data: profiles = [] } = useProfiles()
  const { data: tasks = [] } = useTasks()
  const [range, setRange] = useState<Range>(7)

  const scoped = useMemo(() => filterRange(sessions, range), [sessions, range])
  const userIds = profiles.map((p) => p.id)
  const bars = useMemo(() => dailyActive(scoped, range, userIds), [scoped, range, userIds])
  const maxActive = Math.max(1, ...bars.flatMap((b) => Object.values(b.perUser)))

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Analytics</h1>
        <div className="flex rounded-lg border border-slate-800 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={cn(
                'rounded-md px-3 py-1 text-xs transition',
                range === r.value ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {!isLoading && sessions.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center text-sm text-slate-500">
          No work sessions yet. Start a timer and your productivity stats will appear here.
        </div>
      )}

      {/* Per-user summary cards */}
      {sessions.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {profiles.map((p, i) => (
            <SummaryCard key={p.id} profile={p} index={i} sessions={scoped} tasks={tasks} range={range} />
          ))}
        </div>
      )}

      {/* Daily trend */}
      {bars.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-300">Productive hours per day</h2>
            <div className="flex gap-3 text-[11px]">
              {profiles.map((p, i) => (
                <span key={p.id} className="flex items-center gap-1">
                  <span className={cn('h-2 w-2 rounded-full', USER_BAR[i % USER_BAR.length])} />
                  {p.display_name}
                </span>
              ))}
            </div>
          </div>
          <div className="flex h-40 items-end gap-1">
            {bars.map(({ day, perUser }) => (
              <div key={day.toISOString()} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-full w-full items-end justify-center gap-0.5">
                  {profiles.map((p, i) => {
                    const sec = perUser[p.id] ?? 0
                    return (
                      <div
                        key={p.id}
                        className={cn('w-2 rounded-t', USER_BAR[i % USER_BAR.length])}
                        style={{ height: `${(sec / maxActive) * 100}%` }}
                        title={`${p.display_name}: ${formatHours(sec)} on ${format(day, 'MMM d')}`}
                      />
                    )
                  })}
                </div>
                <span className="text-[9px] text-slate-600">
                  {format(day, range === 7 ? 'EEEEE' : 'd')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  profile,
  index,
  sessions,
  tasks,
  range,
}: {
  profile: Profile
  index: number
  sessions: WorkSession[]
  tasks: Task[]
  range: Range
}) {
  const t = totalsFor(sessions, profile.id)
  const tracked = t.active + t.explained + t.unexplained || 1
  const completed = tasks.filter(
    (task) =>
      task.assignee_id === profile.id &&
      task.status === 'completed' &&
      task.completed_at &&
      (range === 0 || new Date(task.completed_at).getTime() >= Date.now() - range * 86400000),
  ).length

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex items-center justify-between">
        <span className={cn('font-medium', USER_DOT[index % USER_DOT.length])}>{profile.display_name}</span>
        <span className="text-xs text-slate-500">{t.sessions} sessions</span>
      </div>
      <div className="mt-1 text-2xl font-semibold">{formatHours(t.active)}</div>
      <div className="text-xs text-slate-500">productive · {completed} tasks completed</div>

      {/* Focus quality: green / yellow / red */}
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-800">
        <div className="bg-productive" style={{ width: `${(t.active / tracked) * 100}%` }} />
        <div className="bg-explained" style={{ width: `${(t.explained / tracked) * 100}%` }} />
        <div className="bg-unexplained" style={{ width: `${(t.unexplained / tracked) * 100}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-slate-500">
        <span>🟢 {formatHours(t.active)}</span>
        <span>🟡 {formatHours(t.explained)}</span>
        <span>🔴 {formatHours(t.unexplained)}</span>
      </div>
    </div>
  )
}
