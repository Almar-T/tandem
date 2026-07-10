import { useState } from 'react'
import { Calendar, Plus, ExternalLink, Loader2, Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { env } from '@/lib/env'
import {
  connectGoogleCalendar,
  useCalendarEvents,
  useGcalConnections,
  type GCalEvent,
} from './useGcal'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

// Returns YYYY-MM-DD in local time for an event's start.
function eventDateKey(e: GCalEvent): string {
  return e.all_day
    ? e.start.slice(0, 10)
    : new Date(e.start).toLocaleDateString('en-CA')
}

function groupByDay(events: GCalEvent[]): Map<string, GCalEvent[]> {
  const map = new Map<string, GCalEvent[]>()
  for (const e of events) {
    const key = eventDateKey(e)
    const arr = map.get(key) ?? []
    arr.push(e)
    map.set(key, arr)
  }
  return map
}

function next7Days(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return d.toLocaleDateString('en-CA')
  })
}

function dayLabel(dateStr: string, days: string[]): string {
  if (dateStr === days[0]) return 'Today'
  if (dateStr === days[1]) return 'Tomorrow'
  // noon avoids DST issues when constructing a Date from a date string
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString([], {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EventRow({ event }: { event: GCalEvent }) {
  return (
    <a
      href={event.html_link}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-3 rounded-xl px-3 py-1.5 transition hover:bg-hearth-muted"
    >
      <div
        className="mt-[5px] h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: event.calendar_color }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-hearth-green">{event.title}</p>
        <p className="text-[11px] text-hearth-text/50">
          {event.all_day
            ? 'All day'
            : `${fmtTime(event.start)}${event.end ? ` – ${fmtTime(event.end)}` : ''}`}
          {event.location && <> · <span className="truncate">{event.location}</span></>}
        </p>
      </div>
      <ExternalLink
        size={10}
        className="mt-1 shrink-0 opacity-0 transition group-hover:opacity-30"
      />
    </a>
  )
}

// ── CalendarStrip ─────────────────────────────────────────────────────────────

export function CalendarStrip() {
  const qc = useQueryClient()
  const { data: connections = [], isLoading: connLoading } = useGcalConnections()
  const { data: events = [], isLoading: eventsLoading } = useCalendarEvents(connections)

  const [connecting, setConnecting]   = useState(false)
  const [connectErr, setConnectErr]   = useState<string | null>(null)
  const [removingId, setRemovingId]   = useState<string | null>(null)

  const days  = next7Days()
  const byDay = groupByDay(events)

  const loading = connLoading || (connections.length > 0 && eventsLoading)

  async function handleConnect() {
    setConnecting(true)
    setConnectErr(null)
    try {
      await connectGoogleCalendar()
      qc.invalidateQueries({ queryKey: ['calendar_connections'] })
      qc.invalidateQueries({ queryKey: ['calendar_events'] })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Connection failed'
      if (msg !== 'Popup closed') setConnectErr(msg)
    } finally {
      setConnecting(false)
    }
  }

  async function handleDisconnect(id: string) {
    setRemovingId(id)
    await supabase.from('calendar_connections').delete().eq('id', id)
    qc.invalidateQueries({ queryKey: ['calendar_connections'] })
    qc.invalidateQueries({ queryKey: ['calendar_events'] })
    setRemovingId(null)
  }

  // Hide entirely if Google Client ID hasn't been configured yet.
  if (!env.googleClientId) return null

  return (
    <div className="glass overflow-hidden rounded-2xl shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-hearth-border/40 bg-hearth-green px-5 py-3">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-hearth-gold" />
          <span className="font-serif text-sm font-semibold text-hearth-cream">Upcoming</span>
        </div>
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="flex items-center gap-1.5 rounded-lg bg-hearth-gold/20 px-3 py-1.5 text-xs font-medium text-hearth-gold transition hover:bg-hearth-gold/30 disabled:opacity-50"
        >
          {connecting ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
          Add Google Calendar
        </button>
      </div>

      {/* Connected account chips */}
      {connections.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-hearth-border/20 px-5 py-2">
          {connections.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-1.5 rounded-full border border-hearth-border/40 bg-white/50 px-3 py-1"
            >
              <div className="h-2 w-2 rounded-full bg-productive" />
              <span className="text-[11px] text-hearth-text/70">{c.account_email}</span>
              <button
                onClick={() => handleDisconnect(c.id)}
                disabled={removingId === c.id}
                className="ml-1 text-hearth-text/30 transition hover:text-red-400 disabled:opacity-40"
                title="Disconnect"
              >
                {removingId === c.id
                  ? <Loader2 size={10} className="animate-spin" />
                  : <Trash2 size={10} />}
              </button>
            </div>
          ))}
        </div>
      )}

      {connectErr && (
        <p className="px-5 pt-2 text-xs text-red-500">{connectErr}</p>
      )}

      {/* Empty state — no account connected */}
      {!connLoading && connections.length === 0 && (
        <div className="px-5 py-8 text-center">
          <Calendar size={22} className="mx-auto mb-2 text-hearth-border" />
          <p className="text-sm text-hearth-text/50">No calendar connected yet.</p>
          <p className="mt-1 text-xs text-hearth-text/35">
            Click "Add Google Calendar" to see your upcoming events here.
          </p>
        </div>
      )}

      {/* Loading spinner */}
      {loading && connections.length > 0 && (
        <div className="flex items-center gap-2 px-5 py-4 text-xs text-hearth-text/40">
          <Loader2 size={12} className="animate-spin" />
          Loading events…
        </div>
      )}

      {/* Events grouped by day */}
      {!loading && connections.length > 0 && (
        <div className="max-h-96 overflow-y-auto py-2">
          {days.map((dateStr) => {
            const dayEvents = byDay.get(dateStr) ?? []
            return (
              <div key={dateStr} className="px-3 py-1">
                <div className="mb-0.5 flex items-center gap-2 px-2">
                  <span
                    className={cn(
                      'text-[11px] font-semibold',
                      dateStr === days[0]
                        ? 'text-hearth-green'
                        : 'text-hearth-text/40',
                    )}
                  >
                    {dayLabel(dateStr, days)}
                  </span>
                  {dayEvents.length === 0 && (
                    <span className="text-[10px] text-hearth-text/20">free</span>
                  )}
                </div>
                {dayEvents.map((e) => (
                  <EventRow key={e.id} event={e} />
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
