import { useMemo, useState } from 'react'
import {
  format, isSameDay, startOfWeek, endOfWeek, eachDayOfInterval,
  startOfMonth, endOfMonth, addMonths, subMonths, isAfter,
} from 'date-fns'
import { Keyboard, Globe, ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Profile, Task, WorkSession } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useProfiles } from '@/features/profiles/useProfiles'
import { useTasks } from '@/features/tasks/useTasks'
import { useWorkSessions } from './useWorkSessions'
import { filterRange, formatHours, totalsFor, type Range } from './analytics'
import { useBrowserActivity, summariseByDomain, type BrowserActivityRow } from './useBrowserActivity'
import { useDistractionEvents, type DistractionEvent } from './useDistractionEvents'
import { useDesktopActivity, useTauriRunning, summariseByApp } from './useDesktopActivity'

const USER_COLORS = ['#1b2a1e', '#c2a76d']

type ViewMode = 'week' | '30days' | 'month' | 'alltime'

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: 'week',    label: 'This week' },
  { id: '30days',  label: '30 days'   },
  { id: 'month',   label: 'Month'     },
  { id: 'alltime', label: 'All time'  },
]

function viewToRange(mode: ViewMode): Range {
  if (mode === 'week')    return 7
  if (mode === '30days')  return 30
  if (mode === 'alltime') return 0
  return 30
}

/** Days for the weekly chart (always Mon–Sun of current week). */
function weekDays() {
  const now = new Date()
  return eachDayOfInterval({
    start: startOfWeek(now, { weekStartsOn: 1 }),
    end:   endOfWeek(now,   { weekStartsOn: 1 }),
  })
}

/** Days for a rolling 30-day window. */
function rollingDays(n: number) {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - (n - 1))
  return eachDayOfInterval({ start, end })
}

/** All days in a calendar month. */
function monthDays(monthDate: Date) {
  return eachDayOfInterval({ start: startOfMonth(monthDate), end: endOfMonth(monthDate) })
}

function breakdown(sessions: WorkSession[], userId: string, days: Date[]) {
  return days.map((day) => {
    const ds = sessions.filter((s) => s.user_id === userId && isSameDay(new Date(s.started_at), day))
    return {
      day,
      active:      ds.reduce((n, s) => n + s.active_sec, 0),
      explained:   ds.reduce((n, s) => n + s.idle_explained_sec, 0),
      unexplained: ds.reduce((n, s) => n + s.idle_unexplained_sec, 0),
    }
  })
}

export function AnalyticsPage() {
  const navigate = useNavigate()
  const { data: sessions = [], isLoading } = useWorkSessions()
  const { data: profiles = [] } = useProfiles()
  const { data: tasks = [] } = useTasks()

  const [view, setView] = useState<ViewMode>('week')
  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()))

  const range: Range = viewToRange(view)
  const { data: browserRows = [] } = useBrowserActivity(range)
  const { data: distractionEvents = [] } = useDistractionEvents(range)
  const { data: desktopRows = [] } = useDesktopActivity(range)
  const { data: tauriRunning = false } = useTauriRunning()

  // Sessions filtered to the current view
  const scoped = useMemo(() => {
    if (view === 'month') {
      const start = startOfMonth(monthDate)
      const end   = endOfMonth(monthDate)
      return sessions.filter((s) => {
        const d = new Date(s.started_at)
        return d >= start && d <= end
      })
    }
    return filterRange(sessions, range)
  }, [sessions, view, range, monthDate])

  // Days to show in the bar chart
  const chartDays = useMemo(() => {
    if (view === 'week')    return weekDays()
    if (view === '30days')  return rollingDays(30)
    if (view === 'month')   return monthDays(monthDate)
    return rollingDays(30)
  }, [view, monthDate])

  const canGoNextMonth = isAfter(startOfMonth(new Date()), monthDate)

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1 rounded-xl border border-hearth-border/50 bg-white/50 px-3 py-1.5 text-sm text-hearth-text/70 transition hover:bg-hearth-muted hover:text-hearth-green"
          >
            <ChevronLeft size={15} /> Home
          </button>
          <h1 className="font-serif text-2xl font-semibold text-hearth-green">Analytics</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Month navigator (only when Month view active) */}
          {view === 'month' && (
            <div className="flex items-center gap-1 rounded-xl border border-hearth-border/60 bg-white/50 px-2 py-1">
              <button
                onClick={() => setMonthDate((d) => subMonths(d, 1))}
                className="rounded-lg p-1 text-hearth-text/50 transition hover:bg-hearth-muted hover:text-hearth-green"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="min-w-[90px] text-center text-xs font-medium text-hearth-green">
                {format(monthDate, 'MMMM yyyy')}
              </span>
              <button
                onClick={() => setMonthDate((d) => addMonths(d, 1))}
                disabled={!canGoNextMonth}
                className="rounded-lg p-1 text-hearth-text/50 transition hover:bg-hearth-muted hover:text-hearth-green disabled:opacity-30"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          {/* View selector */}
          <div className="flex rounded-xl border border-hearth-border/60 bg-white/50 p-0.5">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition',
                  view === v.id
                    ? 'bg-hearth-green text-hearth-cream shadow-sm'
                    : 'text-hearth-text/60 hover:text-hearth-green',
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading && <p className="text-sm text-hearth-text/50">Loading…</p>}

      {!isLoading && sessions.length === 0 && (
        <div className="rounded-2xl border border-dashed border-hearth-border bg-hearth-muted p-10 text-center text-sm text-hearth-text/50">
          No work sessions yet. Start a timer and your productivity stats will appear here.
        </div>
      )}

      {/* Per-user section: summary + stacked chart */}
      {sessions.length > 0 && profiles.map((p, i) => (
        <UserSection
          key={p.id}
          profile={p}
          index={i}
          sessions={scoped}
          tasks={tasks}
          chartDays={chartDays}
          view={view}
          monthDate={monthDate}
        />
      ))}

      {/* Browser activity */}
      {profiles.length > 0 && (
        <BrowserActivitySection
          rows={browserRows}
          profiles={profiles}
          flaggedDomains={new Set(
            distractionEvents
              .filter((e) => e.action === 'break' || e.action === 'override')
              .map((e) => e.domain),
          )}
        />
      )}

      {/* Desktop app activity */}
      {profiles.length > 0 && (desktopRows.length > 0 || tauriRunning) && (
        <DesktopActivitySection rows={desktopRows} profiles={profiles} tauriRunning={tauriRunning} />
      )}

      {/* Distraction events */}
      {profiles.length > 0 && (
        <DistractionSection events={distractionEvents} profiles={profiles} />
      )}
    </div>
  )
}

// ── Per-user section ──────────────────────────────────────────────────────────

function UserSection({
  profile,
  index,
  sessions,
  tasks,
  chartDays,
  view,
  monthDate,
}: {
  profile: Profile
  index: number
  sessions: WorkSession[]
  tasks: Task[]
  chartDays: Date[]
  view: ViewMode
  monthDate: Date
}) {
  const t = totalsFor(sessions, profile.id)
  const completed = tasks.filter(
    (task) =>
      task.assignee_id === profile.id &&
      task.status === 'completed' &&
      task.completed_at &&
      sessions.some((s) => isSameDay(new Date(s.started_at), new Date(task.completed_at!))),
  ).length

  const bars = breakdown(sessions, profile.id, chartDays)
  const maxSec = Math.max(1, ...bars.map((d) => d.active + d.explained + d.unexplained))
  const color = USER_COLORS[index % 2]

  // For month/30-day views, show abbreviated date labels every N days
  const labelEvery = view === 'month' ? 5 : view === '30days' ? 5 : 1

  return (
    <div className="glass overflow-hidden rounded-2xl shadow-md">
      {/* Summary row */}
      <div className="border-b border-hearth-border/40 px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-serif text-base font-semibold" style={{ color }}>
            {profile.display_name}
          </span>
          <span className="font-serif text-2xl font-bold text-hearth-green">{formatHours(t.active + t.explained)}</span>
          <span className="text-xs text-hearth-text/50">
            total logged · {t.sessions} sessions
            {completed > 0 && ` · ${completed} tasks done`}
          </span>
          <div className="ml-auto flex flex-wrap gap-3 text-[11px] text-hearth-text/50">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm bg-productive" />
              {formatHours(t.active)} active
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm bg-explained" />
              {formatHours(t.explained)} explained
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm bg-unexplained" />
              {formatHours(t.unexplained)} idle
            </span>
          </div>
        </div>
      </div>

      {/* Stacked bar chart */}
      <div className="overflow-x-auto px-5 py-4">
        <div
          className="flex gap-0.5"
          style={{ minWidth: chartDays.length > 14 ? `${chartDays.length * 18}px` : undefined, height: '8rem' }}
        >
          {bars.map(({ day, active, explained, unexplained }, idx) => {
            const total = active + explained + unexplained
            const barH = Math.max((total / maxSec) * 108, total > 0 ? 3 : 0)
            const showLabel = idx % labelEvery === 0 || idx === bars.length - 1
            return (
              <div
                key={day.toISOString()}
                className="group relative flex flex-1 flex-col items-center justify-end gap-0.5"
                style={{ minWidth: chartDays.length > 14 ? '16px' : undefined }}
              >
                {total > 0 && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden -translate-x-1/2 group-hover:block">
                    <div className="whitespace-nowrap rounded-lg bg-hearth-green px-2 py-1 text-[10px] font-medium text-hearth-cream shadow-lg">
                      {format(day, 'EEE MMM d')} · {formatHours(total)}
                    </div>
                  </div>
                )}
                <div
                  className="w-full overflow-hidden rounded-t-sm"
                  style={{ height: `${barH}px` }}
                >
                  <div style={{ height: `${(active      / (total || 1)) * 100}%` }} className="w-full bg-productive" />
                  <div style={{ height: `${(explained   / (total || 1)) * 100}%` }} className="w-full bg-explained" />
                  <div style={{ height: `${(unexplained / (total || 1)) * 100}%` }} className="w-full bg-unexplained" />
                </div>
                <span className="text-[8px] text-hearth-text/40" style={{ visibility: showLabel ? 'visible' : 'hidden' }}>
                  {view === 'week' ? format(day, 'EEEEE') : format(day, 'd')}
                </span>
              </div>
            )
          })}
        </div>

        {view === 'month' && (
          <div className="mt-1 flex justify-between text-[9px] text-hearth-text/30">
            <span>{format(monthDate, 'MMMM 1')}</span>
            <span>{format(endOfMonth(monthDate), 'MMMM d')}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Desktop activity ──────────────────────────────────────────────────────────

function DesktopActivitySection({
  rows,
  profiles,
  tauriRunning,
}: {
  rows: import('./useDesktopActivity').DesktopActivityRow[]
  profiles: Profile[]
  tauriRunning: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="font-serif text-lg font-semibold text-hearth-green">Desktop apps</h2>
        <span className={cn(
          'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
          tauriRunning
            ? 'bg-productive/10 text-productive'
            : 'bg-hearth-muted text-hearth-text/50',
        )}>
          <span className={cn('h-1.5 w-1.5 rounded-full', tauriRunning ? 'animate-pulse bg-productive' : 'bg-hearth-border')} />
          {tauriRunning ? 'tracking now' : 'app not running'}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {profiles.map((p, i) => {
          const apps = summariseByApp(rows, p.id).slice(0, 8)
          const totalSec = apps.reduce((s, a) => s + a.active_sec, 0)
          if (apps.length === 0) return null
          return (
            <div key={p.id} className="glass rounded-2xl p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: USER_COLORS[i % 2] }}>
                  {p.display_name}
                </span>
                <span className="text-[11px] text-hearth-text/50">{formatHours(totalSec)} tracked</span>
              </div>
              <div className="space-y-1.5">
                {apps.map((a) => (
                  <div key={a.app_name} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11px] text-hearth-green">{a.app_name}</span>
                    <div className="h-1 w-16 overflow-hidden rounded-full bg-hearth-border/40">
                      <div
                        className="h-full rounded-full bg-productive"
                        style={{ width: `${(a.active_sec / (apps[0]?.active_sec || 1)) * 100}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-[10px] text-hearth-text/50">{formatHours(a.active_sec)}</span>
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

// ── Distraction events ────────────────────────────────────────────────────────

const ACTION_LABEL: Record<string, { label: string; colour: string }> = {
  explained: { label: 'Explained & continued', colour: 'text-productive'  },
  break:     { label: 'Took a break',          colour: 'text-explained'   },
  lock_in:   { label: 'Locked in',             colour: 'text-unexplained' },
  override:  { label: 'Overrode AI ⚑',        colour: 'text-unexplained' },
}

function DistractionSection({ events, profiles }: { events: DistractionEvent[]; profiles: Profile[] }) {
  if (events.length === 0) return null

  return (
    <div className="space-y-3">
      <h2 className="font-serif text-lg font-semibold text-hearth-green">Distraction alerts</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {profiles.map((p, i) => {
          const mine = events.filter((e) => e.user_id === p.id)
          if (mine.length === 0) return null
          const approved  = mine.filter((e) => e.ai_approved === true).length
          const lockIns   = mine.filter((e) => e.action === 'lock_in').length
          const breaks    = mine.filter((e) => e.action === 'break').length
          const overrides = mine.filter((e) => e.action === 'override').length
          return (
            <div key={p.id} className="glass rounded-2xl p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: USER_COLORS[i % 2] }}>
                  {p.display_name}
                </span>
                <span className="text-[11px] text-hearth-text/50">{mine.length} alerts</span>
              </div>
              <div className="mb-3 flex flex-wrap gap-3 text-[11px]">
                <span className="text-productive">{approved} explained</span>
                <span className="text-explained">{breaks} breaks</span>
                <span className="text-unexplained">{lockIns} locked in</span>
                {overrides > 0 && (
                  <span className="font-medium text-unexplained">{overrides} overrode AI ⚑</span>
                )}
              </div>
              <div className="space-y-2">
                {mine.slice(0, 5).map((e) => {
                  const meta = ACTION_LABEL[e.action] ?? { label: e.action, colour: 'text-hearth-text/50' }
                  return (
                    <div
                      key={e.id}
                      className={cn(
                        'rounded-xl border p-2.5',
                        e.action === 'override'
                          ? 'border-red-200 bg-red-50/60'
                          : 'border-hearth-border/50 bg-white/50',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] font-medium text-hearth-green">{e.domain}</span>
                        <span className={cn('shrink-0 text-[10px]', meta.colour)}>{meta.label}</span>
                      </div>
                      {e.reason && (
                        <p className="mt-1 truncate text-[10px] text-hearth-text/50">"{e.reason}"</p>
                      )}
                      {e.ai_message && e.action === 'explained' && !e.ai_approved && (
                        <p className="mt-1 text-[10px] text-unexplained">{e.ai_message}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Browser activity ──────────────────────────────────────────────────────────

function BrowserActivitySection({
  rows,
  profiles,
  flaggedDomains,
}: {
  rows: BrowserActivityRow[]
  profiles: Profile[]
  flaggedDomains: Set<string>
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-hearth-border bg-hearth-muted p-5 text-center text-xs text-hearth-text/50">
        No browser activity yet — install the HearthHall extension and sign in to start tracking.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <h2 className="font-serif text-lg font-semibold text-hearth-green">Browser activity</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {profiles.map((p, i) => {
          const domains   = summariseByDomain(rows, p.id).slice(0, 8)
          const totalKeys = domains.reduce((s, d) => s + d.keystrokes, 0)
          const totalSec  = domains.reduce((s, d) => s + d.active_sec, 0)
          if (domains.length === 0) return null
          return (
            <div key={p.id} className="glass rounded-2xl p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: USER_COLORS[i % 2] }}>
                  {p.display_name}
                </span>
                <span className="text-[11px] text-hearth-text/50">{formatHours(totalSec)} tracked</span>
              </div>
              <div className="mb-3 flex gap-4 text-xs text-hearth-text/60">
                <span className="flex items-center gap-1">
                  <Keyboard size={12} className="text-hearth-text/40" />
                  {totalKeys.toLocaleString()} keystrokes
                </span>
              </div>
              <div className="space-y-1.5">
                {domains.map((d) => {
                  const flagged = flaggedDomains.has(d.domain)
                  return (
                    <div key={d.domain} className="flex items-center gap-2">
                      <Globe size={11} className={cn('shrink-0', flagged ? 'text-unexplained' : 'text-hearth-text/30')} />
                      <span className={cn('min-w-0 flex-1 truncate text-[11px]', flagged ? 'font-medium text-unexplained' : 'text-hearth-green')}>
                        {d.domain}{flagged && ' ⚑'}
                      </span>
                      <span className={cn('shrink-0 text-[10px]', flagged ? 'text-unexplained' : 'text-hearth-text/50')}>
                        {formatHours(d.active_sec)}
                      </span>
                      {d.keystrokes > 0 && (
                        <span className="shrink-0 text-[10px] text-hearth-text/30">
                          {d.keystrokes}k
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
