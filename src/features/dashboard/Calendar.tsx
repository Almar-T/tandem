import { useMemo, useState } from 'react'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from '@/lib/dates'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Task, TaskStatus } from '@/lib/types'
import { cn } from '@/lib/cn'
import { effectiveStatus } from '@/features/tasks/util'
import { Button } from '@/components/ui/Button'

const DOT: Record<TaskStatus, string> = {
  not_started: 'bg-slate-400',
  in_progress: 'bg-indigo-400',
  completed: 'bg-green-500',
  overdue: 'bg-red-500',
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface Props {
  tasks: Task[]
  onSelectTask: (t: Task) => void
  onSelectDay: (iso: string) => void
}

/** Month grid; tasks appear as chips on their due date. Click a day to add. */
export function Calendar({ tasks, onSelectTask, onSelectDay }: Props) {
  const [month, setMonth] = useState(() => new Date())

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 })
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 })
    return eachDayOfInterval({ start, end })
  }, [month])

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) {
      // Only tasks explicitly flagged for the calendar appear here.
      if (!t.due_date || !t.show_on_calendar) continue
      const key = format(new Date(t.due_date), 'yyyy-MM-dd')
      const list = map.get(key) ?? []
      list.push(t)
      map.set(key, list)
    }
    return map
  }, [tasks])

  function addOnDay(day: Date) {
    const d = new Date(day)
    d.setHours(9, 0, 0, 0)
    onSelectDay(d.toISOString())
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{format(month, 'MMMM yyyy')}</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" onClick={() => setMonth(new Date())} className="px-2 py-1 text-xs">
            Today
          </Button>
          <button
            onClick={() => setMonth((m) => subMonths(m, 1))}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setMonth((m) => addMonths(m, 1))}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px text-center text-[11px] text-slate-500">
        {WEEKDAYS.map((d) => (
          <div key={d} className="pb-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-slate-800">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd')
          const dayTasks = byDay.get(key) ?? []
          const inMonth = isSameMonth(day, month)
          return (
            <div
              key={key}
              onClick={() => addOnDay(day)}
              className={cn(
                'min-h-[84px] cursor-pointer bg-slate-950 p-1.5 transition hover:bg-slate-900',
                !inMonth && 'opacity-40',
              )}
            >
              <div
                className={cn(
                  'mb-1 inline-grid h-5 w-5 place-items-center rounded-full text-[11px]',
                  isToday(day) ? 'bg-indigo-600 text-white' : 'text-slate-400',
                )}
              >
                {format(day, 'd')}
              </div>
              <div className="space-y-0.5">
                {dayTasks.slice(0, 3).map((t) => {
                  const s = effectiveStatus(t)
                  return (
                    <button
                      key={t.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectTask(t)
                      }}
                      className="flex w-full items-center gap-1 rounded bg-slate-800/70 px-1 py-0.5 text-left text-[10px] hover:bg-slate-700"
                    >
                      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DOT[s])} />
                      <span className={cn('truncate', s === 'completed' && 'line-through opacity-60')}>
                        {t.title}
                      </span>
                    </button>
                  )
                })}
                {dayTasks.length > 3 && (
                  <div className="px-1 text-[10px] text-slate-500">+{dayTasks.length - 3} more</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
