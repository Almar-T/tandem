import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Send, Flame, Sun, Moon, Plus, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { cn } from '@/lib/cn'
import { useAssistant } from '@/features/assistant/useAssistant'
import { OPEN_PLANNER_EVENT } from '@/features/assistant/openPlanner'
import { useTasks } from '@/features/tasks/useTasks'
import { useTaskEditor } from '@/features/tasks/useTaskEditor'
import { TaskEditor } from '@/features/tasks/TaskEditor'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return { word: 'Good morning', Icon: Sun }
  if (h < 18) return { word: 'Good afternoon', Icon: Sun }
  return { word: 'Good evening', Icon: Moon }
}

/** Inline AI chat for the dashboard — always visible, no toggle needed. */
function InlineAssistant() {
  const { messages, loading, send } = useAssistant()
  const [text, setText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, loading])

  // Also respond to openPlanner events (e.g., end-of-day button)
  useEffect(() => {
    function handler(e: Event) {
      const prompt = (e as CustomEvent<string | undefined>).detail
      if (prompt) send(prompt)
    }
    window.addEventListener(OPEN_PLANNER_EVENT, handler as EventListener)
    return () => window.removeEventListener(OPEN_PLANNER_EVENT, handler as EventListener)
  }, [send])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    send(text)
    setText('')
  }

  const SUGGESTIONS = [
    "What should I focus on today?",
    "Plan my morning — I have 2 hours free",
    "What's still unfinished this week?",
  ]

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-hearth-border bg-white/50 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-hearth-border bg-hearth-green px-4 py-3">
        <Flame size={16} className="text-hearth-gold" />
        <span className="font-serif text-base font-medium text-hearth-cream">Vera</span>
        <span className="text-xs text-hearth-cream/50">· your AI planner</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-[16rem] flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                m.role === 'user'
                  ? 'bg-hearth-green text-hearth-cream'
                  : 'border border-hearth-border bg-hearth-cream text-hearth-green',
              )}
            >
              <div className="whitespace-pre-wrap">{m.content}</div>
              {m.actions && m.actions.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-hearth-gold/20 pt-2 text-xs text-hearth-text/70">
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
          <div className="flex items-center gap-1.5 text-sm text-hearth-text/50">
            <Flame size={13} className="animate-pulse text-hearth-gold" />
            Thinking…
          </div>
        )}

        {messages.length === 1 && (
          <div className="space-y-2 pt-1">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="block w-full rounded-xl border border-hearth-border bg-hearth-muted px-3 py-2 text-left text-xs text-hearth-text transition hover:border-hearth-gold hover:bg-white"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 border-t border-hearth-border bg-white/60 p-3"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask Vera anything…"
          className="flex-1 rounded-lg border border-hearth-border bg-hearth-cream px-3 py-2 text-sm text-hearth-green outline-none transition focus:border-hearth-gold focus:ring-1 focus:ring-hearth-gold/40"
        />
        <button
          type="submit"
          disabled={loading || !text.trim()}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-hearth-green text-hearth-cream transition hover:bg-hearth-text disabled:opacity-40"
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  )
}

export function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: tasks = [] } = useTasks()
  const ed = useTaskEditor()
  const name = user?.user_metadata?.display_name ?? user?.email?.split('@')[0] ?? 'there'
  const { word: greetWord, Icon: GreetIcon } = greeting()

  const dueToday = tasks.filter(
    (t) => t.status !== 'completed' && t.due_date && isToday(t.due_date),
  ).length
  const completedToday = tasks.filter(
    (t) => t.status === 'completed' && t.completed_at && isToday(t.completed_at),
  ).length

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Greeting */}
      <div className="flex items-center gap-2.5">
        <GreetIcon size={20} className="text-hearth-gold" />
        <h1 className="font-serif text-2xl font-semibold text-hearth-green">
          {greetWord}, {name}
        </h1>
      </div>

      {/* Vera — inline AI, always visible */}
      <InlineAssistant />

      {/* 3 action cards */}
      <div className="grid grid-cols-3 gap-4">
        {/* Today's focus */}
        <ActionCard
          label="Today's Focus"
          count={dueToday}
          countLabel={dueToday === 1 ? 'task due' : 'tasks due'}
          done={completedToday}
          doneLabel="done"
          cta="Add task"
          ctaIcon={<Plus size={13} />}
          onCta={() => ed.openNew()}
          onNavigate={() => navigate('/tasks')}
          accent="gold"
        />

        {/* Goals */}
        <ActionCard
          label="Goals"
          count={null}
          countLabel=""
          done={null}
          doneLabel=""
          cta="View goals"
          ctaIcon={<ChevronRight size={13} />}
          onCta={() => navigate('/goals')}
          onNavigate={() => navigate('/goals')}
          accent="green"
        />

        {/* End day */}
        <ActionCard
          label="End of Day"
          count={completedToday}
          countLabel={completedToday === 1 ? 'completed' : 'completed'}
          done={null}
          doneLabel=""
          cta="Wrap up"
          ctaIcon={<Moon size={13} />}
          onCta={() =>
            window.dispatchEvent(
              new CustomEvent(OPEN_PLANNER_EVENT, {
                detail:
                  "Log off for the day — give me my end-of-day summary: what I completed today, what's still unfinished, anything overdue, and my top priorities for tomorrow.",
              }),
            )
          }
          onNavigate={() => {}}
          accent="muted"
        />
      </div>

      <TaskEditor open={ed.open} onClose={ed.close} task={ed.task} defaultDue={ed.defaultDue} />
    </div>
  )
}

function isToday(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

type Accent = 'gold' | 'green' | 'muted'

function ActionCard({
  label,
  count,
  countLabel,
  done,
  doneLabel,
  cta,
  ctaIcon,
  onCta,
  onNavigate,
  accent,
}: {
  label: string
  count: number | null
  countLabel: string
  done: number | null
  doneLabel: string
  cta: string
  ctaIcon: React.ReactNode
  onCta: () => void
  onNavigate: () => void
  accent: Accent
}) {
  const accentBg: Record<Accent, string> = {
    gold:  'bg-hearth-gold/10 border-hearth-gold/30',
    green: 'bg-hearth-green/5 border-hearth-border',
    muted: 'bg-hearth-muted border-hearth-border',
  }
  const accentNum: Record<Accent, string> = {
    gold:  'text-hearth-green',
    green: 'text-hearth-green',
    muted: 'text-hearth-text',
  }
  const accentBtn: Record<Accent, string> = {
    gold:  'bg-hearth-gold text-hearth-green hover:opacity-90',
    green: 'bg-hearth-green text-hearth-cream hover:bg-hearth-text',
    muted: 'bg-hearth-green text-hearth-cream hover:bg-hearth-text',
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-2xl border p-4 transition hover:shadow-sm',
        accentBg[accent],
      )}
    >
      <div
        className="cursor-pointer"
        onClick={onNavigate}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onNavigate()}
      >
        <div className="mb-1 text-xs font-medium uppercase tracking-widest text-hearth-text/60">
          {label}
        </div>
        {count !== null && (
          <div className={cn('font-serif text-3xl font-semibold', accentNum[accent])}>
            {count}
            <span className="ml-1 font-sans text-xs font-normal text-hearth-text/50">
              {countLabel}
            </span>
          </div>
        )}
        {done !== null && (
          <div className="mt-1 text-xs text-hearth-text/50">
            {done} {doneLabel}
          </div>
        )}
      </div>

      <button
        onClick={onCta}
        className={cn(
          'mt-auto inline-flex items-center gap-1.5 self-start rounded-lg px-3 py-1.5 text-xs font-medium transition',
          accentBtn[accent],
        )}
      >
        {ctaIcon}
        {cta}
      </button>
    </div>
  )
}
