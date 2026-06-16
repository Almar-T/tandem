import { useMemo, useState, type FormEvent } from 'react'
import { format, isSameDay, isAfter, startOfDay, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns'
import {
  Send, Flame, Sun, Moon, Play, Square, PenLine, Check, Plus, Target,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { cn } from '@/lib/cn'
import { useAssistant } from '@/features/assistant/useAssistant'
import { OPEN_PLANNER_EVENT } from '@/features/assistant/openPlanner'
import { useTasks } from '@/features/tasks/useTasks'
import { useTaskEditor } from '@/features/tasks/useTaskEditor'
import { TaskEditor } from '@/features/tasks/TaskEditor'
import { useGoals } from '@/features/goals/useGoals'
import { GoalEditor } from '@/features/goals/GoalEditor'
import { goalProgress } from '@/features/goals/goalProgress'
import { useWorkSessions } from '@/features/analytics/useWorkSessions'
import { useProfiles } from '@/features/profiles/useProfiles'
import { filterRange, totalsFor, formatHours } from '@/features/analytics/analytics'
import { ManualHoursModal } from '@/features/timer/ManualHoursModal'
import { useTimer } from '@/features/timer/TimerProvider'
import { supabase } from '@/lib/supabase'
import { EnableNotifications } from '@/features/notifications/EnableNotifications'
import type { WorkSession } from '@/lib/types'

// ── helpers ──────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return { word: 'Good morning', Icon: Sun }
  if (h < 18) return { word: 'Good afternoon', Icon: Sun }
  return { word: 'Good evening', Icon: Moon }
}

function isToday(s: string) {
  return isSameDay(new Date(s), new Date())
}

function isFuture(s: string) {
  return isAfter(new Date(s), startOfDay(new Date()))
}

function dailyBreakdown(sessions: WorkSession[], userId: string) {
  const now = new Date()
  const days = eachDayOfInterval({
    start: startOfWeek(now, { weekStartsOn: 1 }),
    end: endOfWeek(now, { weekStartsOn: 1 }),
  })
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

// ── Goals bar ────────────────────────────────────────────────────────────────

function GoalsBar() {
  const { data: goals = [] } = useGoals()
  const { data: tasks = [] } = useTasks()
  const navigate = useNavigate()
  const active = goals.filter((g) => g.status === 'active')
  if (active.length === 0) return null

  const cols = Math.min(Math.max(active.length, 1), 5)

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {active.map((g) => {
        const pct = goalProgress(g, tasks)
        return (
          <button
            key={g.id}
            onClick={() => navigate('/goals')}
            className="glass animate-glow flex flex-col gap-2 rounded-2xl border-hearth-gold/30 p-4 text-left transition hover:scale-[1.02]"
          >
            <div className="flex items-center gap-2">
              <Target size={13} className="shrink-0 text-hearth-gold" />
              <span className="line-clamp-1 text-xs font-semibold uppercase tracking-widest text-hearth-text/60">
                {g.category ?? 'Goal'}
              </span>
            </div>
            <p className="line-clamp-2 font-serif text-sm font-medium leading-snug text-hearth-green">
              {g.title}
            </p>
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-hearth-text/50">
                <span>Progress</span>
                <span className="font-semibold text-hearth-gold">{pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-hearth-border/60">
                <div
                  className="h-full rounded-full bg-hearth-gold transition-all duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ── Task brief (shown inside Heather panel) ───────────────────────────────────

function TaskLine({ task, dim = false }: {
  task: { id: string; title: string; status: string; due_date: string | null }
  dim?: boolean
}) {
  const done = task.status === 'completed'
  return (
    <div className={cn('flex items-center gap-3 px-4 py-2.5', dim && 'opacity-55')}>
      <div className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition',
        done ? 'border-productive bg-productive' : 'border-hearth-border',
      )}>
        {done && <Check size={11} className="text-white" />}
      </div>
      <span className={cn('flex-1 truncate text-sm text-hearth-green', done && 'line-through opacity-50')}>
        {task.title}
      </span>
      {task.due_date && (
        <span className="shrink-0 text-[10px] text-hearth-text/40">
          {isToday(task.due_date)
            ? format(new Date(task.due_date), 'h:mm a')
            : format(new Date(task.due_date), 'EEE d')}
        </span>
      )}
    </div>
  )
}

function TaskBrief({ onAdd }: { onAdd: () => void }) {
  const { data: tasks = [] } = useTasks()
  const navigate = useNavigate()

  const today = tasks
    .filter((t) => t.due_date && isToday(t.due_date))
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())

  const upcoming = tasks
    .filter((t) => t.due_date && isFuture(t.due_date) && !isToday(t.due_date) && t.status !== 'completed')
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
    .slice(0, 4)

  return (
    <div className="border-b border-hearth-border/30">
      {/* Today header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div>
          <span className="text-xs font-semibold text-hearth-green">{format(new Date(), 'EEEE, MMMM d')}</span>
          {today.length > 0 && (
            <span className="ml-2 text-[10px] text-hearth-text/40">
              {today.filter((t) => t.status !== 'completed').length} remaining
            </span>
          )}
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-hearth-text/50 transition hover:bg-hearth-muted hover:text-hearth-green"
        >
          <Plus size={11} /> Add task
        </button>
      </div>

      {today.length === 0 ? (
        <p className="px-4 py-3 text-xs text-hearth-text/40">
          No tasks due today — use the tabs below to plan your day.
        </p>
      ) : (
        <div className="divide-y divide-hearth-border/20 pb-1">
          {today.map((t) => <TaskLine key={t.id} task={t} />)}
        </div>
      )}

      {upcoming.length > 0 && (
        <>
          <div className="px-4 pt-2 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-hearth-text/35">
              Upcoming
            </span>
          </div>
          <div className="divide-y divide-hearth-border/15 pb-1">
            {upcoming.map((t) => <TaskLine key={t.id} task={t} dim />)}
          </div>
        </>
      )}

      <div className="px-4 pb-2.5 pt-1">
        <button
          onClick={() => navigate('/tasks')}
          className="text-[11px] text-hearth-text/40 transition hover:text-hearth-gold"
        >
          View all tasks →
        </button>
      </div>
    </div>
  )
}

// ── Heather AI panel ──────────────────────────────────────────────────────────

type HeatherTab = 'new-goal' | 'new-task' | 'plan-day' | 'analytics'

const TABS: { id: HeatherTab; label: string }[] = [
  { id: 'new-goal',  label: 'New Goal'  },
  { id: 'new-task',  label: 'New Task'  },
  { id: 'plan-day',  label: 'Plan Day'  },
  { id: 'analytics', label: 'Analytics' },
]

const TAB_PROMPTS: Record<HeatherTab, string> = {
  'new-goal':  "I'd like to set a new goal. Can you ask me the right questions to define it well?",
  'new-task':  "Help me create a new task — ask me what it is, how long it'll take, and when it's due.",
  'plan-day':  'Plan my day for today. Check what tasks are due and suggest a schedule.',
  'analytics': 'Give me a summary of my productivity this week — highlights and anything I should improve.',
}

function HeatherPanel({
  name,
  onOpenTask,
  onOpenGoal,
}: {
  name: string
  onOpenTask: () => void
  onOpenGoal: () => void
}) {
  const { messages, loading, send } = useAssistant()
  const { word } = greeting()
  const [tab, setTab] = useState<HeatherTab | null>(null)
  const [text, setText] = useState('')
  const navigate = useNavigate()

  function handleTalkToHeather() {
    if (!tab) return
    send(TAB_PROMPTS[tab])
    setTab(null)
  }

  function handleManually() {
    if (tab === 'new-task')  { onOpenTask(); setTab(null) }
    if (tab === 'new-goal')  { onOpenGoal(); setTab(null) }
    if (tab === 'plan-day')  { navigate('/tasks'); setTab(null) }
    if (tab === 'analytics') { navigate('/analytics'); setTab(null) }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    send(text)
    setText('')
  }

  return (
    <div className="glass flex flex-col overflow-hidden rounded-2xl shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-hearth-border/40 bg-hearth-green px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Flame size={16} className="text-hearth-gold" />
          <div>
            <span className="font-serif text-base font-semibold text-hearth-cream">Heather</span>
            <span className="ml-2 text-xs text-hearth-cream/50">your AI planner</span>
          </div>
        </div>
        <p className="font-serif text-sm text-hearth-cream/70">{word}, {name}!</p>
      </div>

      {/* Task brief (always shown) */}
      <TaskBrief onAdd={onOpenTask} />

      {/* Quick-action tabs */}
      <div className="border-b border-hearth-border/30 px-4 pt-3 pb-0">
        <div className="flex gap-1.5 overflow-x-auto pb-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(tab === t.id ? null : t.id)}
              className={cn(
                'shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium transition',
                tab === t.id
                  ? 'bg-hearth-green text-hearth-cream shadow-sm'
                  : 'border border-hearth-border/60 bg-white/50 text-hearth-text hover:border-hearth-gold hover:text-hearth-green',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab && (
          <div className="animate-fade-up mb-3 flex gap-2 rounded-xl border border-hearth-border/50 bg-white/60 p-3">
            <button
              onClick={handleTalkToHeather}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-hearth-green px-3 py-2 text-xs font-medium text-hearth-cream shadow-sm transition hover:bg-hearth-text"
            >
              <Flame size={12} /> Talk to Heather
            </button>
            <button
              onClick={handleManually}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-hearth-border bg-white/70 px-3 py-2 text-xs font-medium text-hearth-text transition hover:bg-hearth-muted"
            >
              Do manually
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      {messages.slice(1).length > 0 && (
        <div className="max-h-72 space-y-3 overflow-y-auto px-4 py-3">
          {messages.slice(1).map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                m.role === 'user'
                  ? 'bg-hearth-green text-hearth-cream'
                  : 'border border-hearth-border/50 bg-white/80 text-hearth-green shadow-sm',
              )}>
                <div className="whitespace-pre-wrap">{m.content}</div>
                {m.actions && m.actions.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-hearth-gold/20 pt-2 text-xs text-hearth-text/60">
                    {m.actions.map((a, j) => (
                      <div key={j} className="flex items-start gap-1">
                        <span className="text-hearth-gold">✓</span>
                        <span>{a.detail}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-1.5 text-xs text-hearth-text/50">
              <Flame size={12} className="animate-pulse text-hearth-gold" />
              Heather is thinking…
            </div>
          )}
        </div>
      )}
      {loading && messages.slice(1).length === 0 && (
        <div className="flex items-center gap-1.5 px-4 py-3 text-xs text-hearth-text/50">
          <Flame size={12} className="animate-pulse text-hearth-gold" />
          Heather is thinking…
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 border-t border-hearth-border/40 bg-white/40 px-4 py-3"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask Heather anything…"
          className="flex-1 rounded-xl border border-hearth-border/50 bg-white/70 px-3 py-2 text-sm text-hearth-green outline-none transition placeholder:text-hearth-text/30 focus:border-hearth-gold focus:ring-1 focus:ring-hearth-gold/30"
        />
        <button
          type="submit"
          disabled={loading || !text.trim()}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-hearth-green text-hearth-cream shadow-sm transition hover:bg-hearth-text disabled:opacity-40"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  )
}

// ── Inline weekly analytics ───────────────────────────────────────────────────

const USER_COLORS = ['#1b2a1e', '#c2a76d']

function DashboardAnalytics() {
  const { data: sessions = [] } = useWorkSessions()
  const { data: profiles = [] } = useProfiles()

  const week = useMemo(() => filterRange(sessions, 7), [sessions])

  if (profiles.length === 0) return null

  return (
    <div className="space-y-4">
      <h2 className="font-serif text-lg font-semibold text-hearth-green">This week</h2>

      {profiles.map((p, i) => {
        const t = totalsFor(week, p.id)
        const breakdown = dailyBreakdown(week, p.id)
        const maxSec = Math.max(1, ...breakdown.map((d) => d.active + d.explained + d.unexplained))

        return (
          <div key={p.id} className="glass overflow-hidden rounded-2xl shadow-md">
            {/* Summary row */}
            <div className="flex items-baseline gap-4 border-b border-hearth-border/40 px-5 py-4">
              <p
                className="font-serif text-sm font-semibold uppercase tracking-widest"
                style={{ color: USER_COLORS[i % 2] }}
              >
                {p.display_name}
              </p>
              <p className="font-serif text-2xl font-bold text-hearth-green">{formatHours(t.active)}</p>
              <p className="text-xs text-hearth-text/50">productive · {t.sessions} sessions</p>
              <div className="ml-auto flex gap-3 text-[11px] text-hearth-text/50">
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-productive" /> {formatHours(t.active)}</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-explained" /> {formatHours(t.explained)}</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-unexplained" /> {formatHours(t.unexplained)}</span>
              </div>
            </div>

            {/* Stacked bar chart */}
            <div className="px-5 py-4">
              <div className="flex h-28 gap-1.5">
                {breakdown.map(({ day, active, explained, unexplained }) => {
                  const total = active + explained + unexplained
                  const barH = Math.max((total / maxSec) * 96, total > 0 ? 3 : 0)
                  return (
                    <div key={day.toISOString()} className="flex flex-1 flex-col items-center justify-end gap-1">
                      <div
                        className="w-full overflow-hidden rounded-t-sm"
                        style={{ height: `${barH}px` }}
                      >
                        <div style={{ height: `${(active      / (total || 1)) * 100}%` }} className="w-full bg-productive" />
                        <div style={{ height: `${(explained   / (total || 1)) * 100}%` }} className="w-full bg-explained" />
                        <div style={{ height: `${(unexplained / (total || 1)) * 100}%` }} className="w-full bg-unexplained" />
                      </div>
                      <span className="text-[9px] text-hearth-text/40">{format(day, 'EEEEE')}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── End-day confirmation ──────────────────────────────────────────────────────

function EndDayConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-hearth-green/30 backdrop-blur-sm">
      <div className="animate-fade-up glass mx-4 w-full max-w-sm rounded-2xl p-6 shadow-2xl">
        <Moon size={24} className="mb-3 text-hearth-gold" />
        <h2 className="font-serif text-xl font-semibold text-hearth-green">End your day?</h2>
        <p className="mt-2 mb-6 text-sm text-hearth-text/70">
          Heather will summarise what you completed, flag anything still open, and set your top priorities for tomorrow.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-hearth-border bg-white/60 py-2.5 text-sm text-hearth-text transition hover:bg-hearth-muted"
          >
            Not yet
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-hearth-green py-2.5 text-sm font-medium text-hearth-cream shadow-sm transition hover:bg-hearth-text"
          >
            Yes, wrap up
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Bottom action cluster ─────────────────────────────────────────────────────

function BottomCluster({
  onLogHours,
  onEndDay,
}: {
  onLogHours: () => void
  onEndDay: () => void
}) {
  const t = useTimer()

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
      <button
        onClick={() => (t.running ? t.stop() : t.start())}
        className={cn(
          'flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium shadow-lg transition',
          t.running
            ? 'bg-productive text-white hover:bg-green-700'
            : 'bg-hearth-green text-hearth-cream hover:bg-hearth-text',
        )}
      >
        {t.running ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
        {t.running ? `Stop  ${formatSec(t.activeSec)}` : 'Start timer'}
      </button>

      <button
        onClick={onLogHours}
        className="flex items-center gap-2 rounded-2xl border border-hearth-border bg-white/70 px-4 py-2.5 text-sm text-hearth-text shadow-sm backdrop-blur transition hover:bg-hearth-muted"
      >
        <PenLine size={14} className="text-explained" />
        Log hours
      </button>

      <button
        onClick={onEndDay}
        className="flex items-center gap-2 rounded-2xl border border-hearth-border bg-white/70 px-4 py-2.5 text-sm text-hearth-text shadow-sm backdrop-blur transition hover:bg-hearth-muted"
      >
        <Moon size={14} className="text-hearth-gold" />
        End day
      </button>
    </div>
  )
}

function formatSec(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { user } = useAuth()
  const ed = useTaskEditor()
  const [goalEditorOpen, setGoalEditorOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [endDayConfirm, setEndDayConfirm] = useState(false)

  const name = user?.user_metadata?.display_name ?? user?.email?.split('@')[0] ?? 'there'

  function confirmEndDay() {
    setEndDayConfirm(false)
    // Fire accomplishment notification to both users (fire-and-forget).
    supabase.functions.invoke('end-of-day').catch(() => {})
    // Open Heather for personal end-of-day reflection.
    window.dispatchEvent(
      new CustomEvent(OPEN_PLANNER_EVENT, {
        detail:
          "Log off for the day — give me my end-of-day summary: what I completed today, what's still unfinished, anything overdue, and my top priorities for tomorrow.",
      }),
    )
  }

  return (
    <div className="space-y-5 pb-40">
      {/* Prompt to enable push notifications — only shown on dashboard */}
      <EnableNotifications />

      {/* Goals bar — dynamic columns */}
      <GoalsBar />

      {/* Heather panel — full width */}
      <HeatherPanel
        name={name}
        onOpenTask={() => ed.openNew()}
        onOpenGoal={() => setGoalEditorOpen(true)}
      />

      {/* Inline per-user analytics */}
      <DashboardAnalytics />

      {/* Modals */}
      <TaskEditor open={ed.open} onClose={ed.close} task={ed.task} defaultDue={ed.defaultDue} />
      <GoalEditor open={goalEditorOpen} onClose={() => setGoalEditorOpen(false)} goal={null} />
      <ManualHoursModal open={logOpen} onClose={() => setLogOpen(false)} />

      {endDayConfirm && (
        <EndDayConfirm onConfirm={confirmEndDay} onCancel={() => setEndDayConfirm(false)} />
      )}

      <BottomCluster onLogHours={() => setLogOpen(true)} onEndDay={() => setEndDayConfirm(true)} />
    </div>
  )
}
