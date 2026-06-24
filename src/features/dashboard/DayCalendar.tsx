import { format } from '@/lib/dates'
import { CalendarClock, Sparkles, Coffee } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Profile } from '@/lib/types'
import { openPlanner } from '@/features/assistant/openPlanner'
import { useDayPlans, type DaySlot } from './useDayPlans'

// ── Layout constants ─────────────────────────────────────────────────────────

const HOUR_HEIGHT = 56
const START_HOUR  = 8    // 8 AM
const END_HOUR    = 20   // 8 PM
const HOURS       = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
const TOTAL_H     = (END_HOUR - START_HOUR) * HOUR_HEIGHT

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse "HH:MM" → total minutes since midnight. Timezone-safe. */
function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

function minutesToOffset(min: number): number {
  return ((min - START_HOUR * 60) / 60) * HOUR_HEIGHT
}

function fmtHour(h: number): string {
  if (h === 12) return '12 PM'
  return h > 12 ? `${h - 12} PM` : `${h} AM`
}

function fmtSlotTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour   = h > 12 ? h - 12 : h === 0 ? 12 : h
  return m === 0 ? `${hour} ${period}` : `${hour}:${String(m).padStart(2, '0')} ${period}`
}

// ── Work-type colours ─────────────────────────────────────────────────────────

const WT_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  deep_work: { bg: '#1b2a1e', text: '#f9f7f2', border: '#1b2a1e' },
  admin:     { bg: '#e8e4da', text: '#3d4f3f', border: '#d4cfc4' },
  meeting:   { bg: '#fef3c7', text: '#78350f', border: '#fcd34d' },
  creative:  { bg: '#ede9fe', text: '#4c1d95', border: '#c4b5fd' },
  study:     { bg: '#dbeafe', text: '#1e3a5f', border: '#93c5fd' },
  collab:    { bg: '#fef9c3', text: '#713f12', border: '#fde047' },
}
const BREAK_STYLE = { bg: '#f9f7f2', text: '#a09585', border: '#d4cfc4' }
const WT_DEFAULT  = { bg: '#e8e4da', text: '#3d4f3f', border: '#d4cfc4' }

// ── Single slot block ────────────────────────────────────────────────────────

function SlotBlock({ slot }: { slot: DaySlot }) {
  const startMin = parseMinutes(slot.start)
  const endMin   = parseMinutes(slot.end)

  const top    = Math.max(0, minutesToOffset(startMin))
  const rawH   = minutesToOffset(endMin) - minutesToOffset(startMin)
  const height = Math.max(22, Math.min(rawH, TOTAL_H - top))

  const colors = slot.is_break
    ? BREAK_STYLE
    : (WT_STYLE[slot.work_type ?? ''] ?? WT_DEFAULT)

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
      }}
      className="overflow-hidden rounded-md px-1.5 py-0.5 transition hover:z-10 hover:shadow-md"
    >
      <div className="flex items-center gap-1">
        {slot.is_break && <Coffee size={9} className="shrink-0 opacity-60" />}
        <p className={cn('truncate text-[11px] font-medium leading-tight', slot.is_break && 'italic opacity-70')}>
          {slot.title}
        </p>
      </div>
      {height >= 34 && (
        <p className="mt-0.5 text-[10px] opacity-55">
          {fmtSlotTime(slot.start)}–{fmtSlotTime(slot.end)}
        </p>
      )}
    </div>
  )
}

// ── One user's column ────────────────────────────────────────────────────────

function UserCol({ slots }: { profile: Profile; slots: DaySlot[] }) {
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

      {slots.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="px-3 text-center text-xs text-hearth-text/25">No plan yet</p>
        </div>
      )}

      {slots.map((s, i) => (
        <SlotBlock key={i} slot={s} />
      ))}
    </div>
  )
}

// ── Exported component ────────────────────────────────────────────────────────

export function DayCalendar({ profiles }: { profiles: Profile[] }) {
  const today = new Date()
  const { data: plans = [] } = useDayPlans(today)

  if (profiles.length < 1) return null

  const nowMin  = today.getHours() * 60 + today.getMinutes()
  const nowY    = minutesToOffset(nowMin)
  const showNow = nowY >= 0 && nowY <= TOTAL_H

  const slotsFor = (profile: Profile): DaySlot[] =>
    plans.find((p) => p.user_id === profile.id)?.slots ?? []

  const hasAnyPlan = profiles.some((p) => slotsFor(p).length > 0)

  return (
    <div className="glass overflow-hidden rounded-2xl shadow-md">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-hearth-border/40 bg-hearth-green px-5 py-3">
        <div className="flex items-center gap-2">
          <CalendarClock size={15} className="text-hearth-gold" />
          <span className="font-serif text-sm font-semibold text-hearth-cream">Plan for the Day</span>
          <span className="text-xs text-hearth-cream/50">· {format(today, 'EEEE, MMMM d')}</span>
        </div>
        <button
          onClick={() => openPlanner(
            "Let's plan our day. Look at my tasks and suggest a full schedule with time blocks and breaks — then I'll ask you to save it to the calendar.",
          )}
          className="flex items-center gap-1.5 rounded-lg bg-hearth-gold/20 px-3 py-1.5 text-xs font-medium text-hearth-gold transition hover:bg-hearth-gold/30"
        >
          <Sparkles size={12} /> Plan with Heather
        </button>
      </div>

      {/* ── No plan empty state ─────────────────────────────────── */}
      {!hasAnyPlan && (
        <div className="px-5 py-6 text-center text-sm text-hearth-text/40">
          No plan for today yet.{' '}
          <button
            onClick={() => openPlanner(
              "Let's plan our day. Look at my tasks and suggest a full schedule — then I'll ask you to save it.",
            )}
            className="text-hearth-gold underline-offset-2 hover:underline"
          >
            Ask Heather to plan it
          </button>
          {' '}and then say "save this to the calendar".
        </div>
      )}

      {/* ── Calendar grid (only shown when there's a plan) ─────── */}
      {hasAnyPlan && (
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

            {/* User columns + now-line */}
            <div className="relative flex flex-1" style={{ height: TOTAL_H }}>
              {profiles.slice(0, 2).map((p) => (
                <UserCol key={p.id} profile={p} slots={slotsFor(p)} />
              ))}

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
      )}
    </div>
  )
}
