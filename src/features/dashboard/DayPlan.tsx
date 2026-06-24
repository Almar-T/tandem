import { isSameDay } from '@/lib/dates'
import { CalendarClock, Play, Sparkles, Square } from 'lucide-react'
import type { Task } from '@/lib/types'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { WORK_TYPES } from '@/features/tasks/constants'
import { openPlanner } from '@/features/assistant/openPlanner'
import { useTimer } from '@/features/timer/TimerProvider'

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** Today's AI-planned schedule: tasks laid out by their scheduled time. */
export function DayPlan({ tasks, onSelectTask }: { tasks: Task[]; onSelectTask: (t: Task) => void }) {
  const timer = useTimer()
  const today = new Date()
  const scheduled = tasks
    .filter((t) => t.scheduled_start && isSameDay(new Date(t.scheduled_start), today))
    .sort(
      (a, b) => new Date(a.scheduled_start!).getTime() - new Date(b.scheduled_start!).getTime(),
    )

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
          <CalendarClock size={16} className="text-indigo-400" /> Today’s Plan
        </div>
        <Button variant="subtle" onClick={() => openPlanner('Plan my day for today.')}>
          <Sparkles size={14} /> Plan my day
        </Button>
      </div>

      {scheduled.length === 0 ? (
        <p className="text-sm text-slate-500">
          No schedule yet. Hit “Plan my day” and the Planner will arrange your tasks into focused
          blocks with breaks — and explain why.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {scheduled.map((t) => {
            const wt = WORK_TYPES.find((w) => w.value === t.work_type)
            const done = t.status === 'completed'
            const isTiming = timer.task?.id === t.id
            return (
              <li
                key={t.id}
                className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 pr-2 transition hover:bg-slate-800"
              >
                <button
                  onClick={() => onSelectTask(t)}
                  className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left"
                >
                  <span className="w-24 shrink-0 text-xs tabular-nums text-slate-400">
                    {fmt(t.scheduled_start!)}
                    {t.scheduled_end ? `–${fmt(t.scheduled_end)}` : ''}
                  </span>
                  <span className={cn('min-w-0 flex-1 truncate text-sm', done && 'text-slate-500 line-through')}>
                    {t.title}
                  </span>
                  {wt && (
                    <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                      {wt.label}
                    </span>
                  )}
                </button>
                {!done && (
                  <button
                    onClick={() => (isTiming ? timer.stop() : timer.start(t))}
                    className={cn(
                      'shrink-0 rounded-lg p-1.5 transition hover:bg-slate-700',
                      isTiming ? 'text-productive' : 'text-slate-500 hover:text-slate-300',
                    )}
                    title={isTiming ? 'Stop timer' : 'Start timer'}
                  >
                    {isTiming ? <Square size={15} /> : <Play size={15} />}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
