import { isSameDay, format } from 'date-fns'
import { CalendarClock, Sparkles } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Task } from '@/lib/types'
import type { Profile } from '@/lib/types'
import { openPlanner } from '@/features/assistant/openPlanner'

// ── Layout constants ────────────────────────────────────────────────────────

const HOUR_HEIGHT = 56   // px per hour
const START_HOUR  = 8    // 8 AM
const END_HOUR    = 20   // 8 PM
const HOURS       = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
const TOTAL_H     = (END_HOUR - START_HOUR) * HOUR_HEIGHT

// ── Helpers ─────────────────────────────────────────────────────────────────

function minutesToOffset(minutes: number) {
  return ((minutes - START_HOUR * 60) / 60) * HOUR_HEIGHT
}

function fmtHour(h: number) {
  if (h === 12) return '12 PM'
  return h > 12 ? `${h - 12} PM` : `${h} AM`
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

// ── Work-type colours ────────────────────────────────────────────────────────

const WT_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  deep_work: { bg: '#1b2a1e', text: '#f9f7f2', border: '#1b2a1e' },
  admin:     { bg: '#e8e4da', text: '#3d4f3f', border: '#d4cfc4' },
  meeting:   { bg: '#fef3c7', text: '#78350f', border: '#fcd34d' },
  creative:  { bg: '#ede9fe', text: '#4c1d95', border: '#c4b5fd' },
  study:     { bg: '#dbeafe', text: '#1e3a5f', border: '#93c5fd' },
  collab:    { bg: '#fef9c3', text: '#713f12', border: '#fde047' },
}
const WT_DEFAULT = { bg: '#e8e4da', text: '#3d4f3f', border: '#d4cfc4' }

// ── Single task block ────────────────────────────────────────────────────────

function Block({ task }: { task: Task }) {
  const start = new Date(task.scheduled_start!)
  const endMs  = task.scheduled_end
    ? new Date(task.scheduled_end).getTime()
    : start.getTime() + (task.estimate_min ?? 30) * 60_000
  const end = new Date(endMs)

  const startMin  = start.getHours() * 60 + start.getMinutes()
  const endMin    = end.getHours()   * 60 + end.getMinutes()
  const top       = Math.max(0, minutesToOffset(startMin))
  const rawH      = minutesToOffset(endMin) - minutesToOffset(startMin)
  const height    = Math.max(22, Math.min(rawH, TOTAL_H - top))

  const done   = task.status === 'completed'
  const colors = WT_STYLE[task.work_type ?? ''] ?? WT_DEFAULT

  return (
    <div
      style={{
        position: 'absolute',
        top,
        height,
        left: 3,
        right: 3,
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        opacity: done ? 0.45 : 1,
      }}
      className="overflow-hidden rounded-md px-1.5 py-0.5 transition hover:z-10 hover:shadow-md"
    >
      <p className={cn('text-[11px] font-medium leading-tight', done && 'line-through')}>
        {task.title}
      </p>
      {height >= 34 && (
        <p className="mt-0.5 text-[10px] opacity-60">
          {fmtTime(task.scheduled_start!)}
          {task.scheduled_end ? `–${fmtTime(task.scheduled_end)}` : ''}
        </p>
      )}
    </div>
  )
}

// ── One user's column ────────────────────────────────────────────────────────

function UserCol({ profile, tasks }: { profile: Profile; tasks: Task[] }) {
  const today = new Date()
  const mine  = tasks.filter(
    (t) => t.scheduled_start && t.assignee_id === profile.id && isSameDay(new Date(t.scheduled_start), today),
  )

  return (
    <div className="relative flex-1 border-l border-hearth-border/30" style={{ height: TOTAL_H }}>
      {/* Hour grid lines */}
      {HOURS.map((_, i) => (
        <div
          key={i}
          style={{ top: i * HOUR_HEIGHT }}
          className="absolute inset-x-0 border-t border-hearth-border/20"
        />
      ))}

      {mine.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="px-3 text-center text-xs text-hearth-text/25">No schedule yet</p>
        </div>
      )}

      {mine.map((t) => (
        <Block key={t.id} task={t} />
      ))}
    </div>
  )
}

// ── Exported component ───────────────────────────────────────────────────────

export function DayCalendar({ tasks, profiles }: { tasks: Task[]; profiles: Profile[] }) {
  if (profiles.length < 1) return null

  const now      = new Date()
  const nowMin   = now.getHours() * 60 + now.getMinutes()
  const nowY     = minutesToOffset(nowMin)
  const showNow  = nowY >= 0 && nowY <= TOTAL_H

  return (
    <div className="glass overflow-hidden rounded-2xl shadow-md">
      {/* ── Panel header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-hearth-border/40 bg-hearth-green px-5 py-3">
        <div className="flex items-center gap-2">
          <CalendarClock size={15} className="text-hearth-gold" />
          <span className="font-serif text-sm font-semibold text-hearth-cream">Plan for the Day</span>
          <span className="text-xs text-hearth-cream/50">· {format(now, 'EEEE, MMMM d')}</span>
        </div>
        <button
          onClick={() => openPlanner(
            "Let's plan our day together. Look at what tasks we have and suggest a full schedule for today — then I'll ask you to put it in the calendar.",
          )}
          className="flex items-center gap-1.5 rounded-lg bg-hearth-gold/20 px-3 py-1.5 text-xs font-medium text-hearth-gold transition hover:bg-hearth-gold/30"
        >
          <Sparkles size={12} /> Plan with Heather
        </button>
      </div>

      {/* ── Scrollable calendar grid ──────────────────────────── */}
      <div className="overflow-y-auto" style={{ maxHeight: 420 }}>
        {/* Sticky column headers */}
        <div className="sticky top-0 z-20 flex border-b border-hearth-border/40 bg-hearth-cream">
          <div className="w-12 shrink-0" />
          {profiles.slice(0, 2).map((p) => (
            <div
              key={p.id}
              className="flex flex-1 items-center justify-center border-l border-hearth-border/30 py-2"
            >
              <span className="font-serif text-sm font-semibold text-hearth-green">{p.display_name}</span>
            </div>
          ))}
        </div>

        {/* Time ruler + columns */}
        <div className="flex">
          {/* Hour labels */}
          <div className="relative w-12 shrink-0" style={{ height: TOTAL_H }}>
            {HOURS.map((h, i) => (
              <div
                key={h}
                style={{ top: i * HOUR_HEIGHT - 7 }}
                className="absolute right-2 text-[10px] tabular-nums text-hearth-text/35"
              >
                {fmtHour(h)}
              </div>
            ))}
          </div>

          {/* User columns + now-line wrapper */}
          <div className="relative flex flex-1" style={{ height: TOTAL_H }}>
            {profiles.slice(0, 2).map((p) => (
              <UserCol key={p.id} profile={p} tasks={tasks} />
            ))}

            {/* Current-time indicator */}
            {showNow && (
              <div
                style={{ top: nowY }}
                className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
              >
                <div className="ml-0.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                <div className="flex-1 border-t border-red-500 opacity-70" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
