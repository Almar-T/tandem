import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Keyboard, MousePointer2, Globe } from 'lucide-react'
import type { Profile, Task, WorkSession } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useProfiles } from '@/features/profiles/useProfiles'
import { useTasks } from '@/features/tasks/useTasks'
import { useWorkSessions } from './useWorkSessions'
import { dailyActive, filterRange, formatHours, totalsFor, type Range } from './analytics'
import { useBrowserActivity, summariseByDomain, type BrowserActivityRow } from './useBrowserActivity'
import { useDistractionEvents, type DistractionEvent } from './useDistractionEvents'

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
  const { data: browserRows = [] } = useBrowserActivity(range === 0 ? 0 : range)
  const { data: distractionEvents = [] } = useDistractionEvents(range === 0 ? 0 : range)

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

      {/* Browser activity (from extension) */}
      {profiles.length > 0 && (
        <BrowserActivitySection rows={browserRows} profiles={profiles} />
      )}

      {/* Distraction events */}
      {profiles.length > 0 && (
        <DistractionSection events={distractionEvents} profiles={profiles} />
      )}
    </div>
  )
}

const ACTION_LABEL: Record<string, string> = {
  explained: 'Explained & continued',
  break: 'Took a break',
  lock_in: 'Locked in',
}

function DistractionSection({ events, profiles }: { events: DistractionEvent[]; profiles: Profile[] }) {
  if (events.length === 0) return null

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-slate-300">Distraction alerts</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {profiles.map((p, i) => {
          const mine = events.filter((e) => e.user_id === p.id)
          if (mine.length === 0) return null
          const approved = mine.filter((e) => e.ai_approved === true).length
          const lockIns = mine.filter((e) => e.action === 'lock_in').length
          const breaks = mine.filter((e) => e.action === 'break').length
          return (
            <div key={p.id} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className={cn('text-sm font-medium', USER_DOT[i % USER_DOT.length])}>
                  {p.display_name}
                </span>
                <span className="text-[11px] text-slate-500">{mine.length} alerts</span>
              </div>
              <div className="mb-3 flex gap-3 text-[11px]">
                <span className="text-emerald-400">{approved} explained</span>
                <span className="text-amber-400">{breaks} breaks</span>
                <span className="text-red-400">{lockIns} locked in</span>
              </div>
              <div className="space-y-2">
                {mine.slice(0, 5).map((e) => (
                  <div key={e.id} className="rounded-lg border border-slate-800 bg-slate-900 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] font-medium text-slate-300">{e.domain}</span>
                      <span className={cn('shrink-0 text-[10px]',
                        e.action === 'explained' ? 'text-emerald-400' :
                        e.action === 'break' ? 'text-amber-400' : 'text-red-400',
                      )}>
                        {ACTION_LABEL[e.action]}
                      </span>
                    </div>
                    {e.reason && (
                      <p className="mt-1 truncate text-[10px] text-slate-500">"{e.reason}"</p>
                    )}
                    {e.ai_message && e.action === 'explained' && !e.ai_approved && (
                      <p className="mt-1 text-[10px] text-red-400">{e.ai_message}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BrowserActivitySection({
  rows,
  profiles,
}: {
  rows: BrowserActivityRow[]
  profiles: Profile[]
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-5 text-center text-xs text-slate-500">
        No browser activity yet — install the Tandem extension and sign in to start tracking.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-slate-300">Browser activity</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {profiles.map((p, i) => {
          const domains = summariseByDomain(rows, p.id).slice(0, 8)
          const totalKeys = domains.reduce((s, d) => s + d.keystrokes, 0)
          const totalClicks = domains.reduce((s, d) => s + d.clicks, 0)
          const totalSec = domains.reduce((s, d) => s + d.active_sec, 0)
          if (domains.length === 0) return null
          return (
            <div key={p.id} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className={cn('text-sm font-medium', USER_DOT[i % USER_DOT.length])}>
                  {p.display_name}
                </span>
                <span className="text-[11px] text-slate-500">{formatHours(totalSec)} tracked</span>
              </div>
              <div className="mb-3 flex gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Keyboard size={12} className="text-slate-500" />
                  {totalKeys.toLocaleString()} keystrokes
                </span>
                <span className="flex items-center gap-1">
                  <MousePointer2 size={12} className="text-slate-500" />
                  {totalClicks.toLocaleString()} clicks
                </span>
              </div>
              <div className="space-y-1.5">
                {domains.map((d) => (
                  <div key={d.domain} className="flex items-center gap-2">
                    <Globe size={11} className="shrink-0 text-slate-600" />
                    <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">{d.domain}</span>
                    <span className="shrink-0 text-[10px] text-slate-500">{formatHours(d.active_sec)}</span>
                    <span className="shrink-0 text-[10px] text-slate-600">
                      {d.keystrokes > 0 && `${d.keystrokes}k`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
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
