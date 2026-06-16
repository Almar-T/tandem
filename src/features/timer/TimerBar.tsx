import { useState } from 'react'
import { Pause, Play, PenLine } from 'lucide-react'
import type { IdleReason } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useTimer } from './TimerProvider'
import { ManualHoursModal } from './ManualHoursModal'

function clock(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

const REASONS: { value: IdleReason; label: string }[] = [
  { value: 'reading', label: 'Reading' },
  { value: 'thinking', label: 'Thinking' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'call', label: 'Call' },
  { value: 'bathroom', label: 'Break' },
  { value: 'other', label: 'Other' },
]

/** Persistent timer. Idle → a one-click start pill + log button; running → the full session bar. */
export function TimerBar() {
  const t = useTimer()
  const [logOpen, setLogOpen] = useState(false)

  if (!t.running) {
    return (
      <>
        <div className="fixed left-1/2 top-[60px] z-30 flex -translate-x-1/2 items-center gap-1.5">
          <button
            onClick={() => t.start()}
            className="inline-flex items-center gap-1.5 rounded-full border border-hearth-border bg-hearth-cream/90 px-3 py-1.5 text-xs text-hearth-text shadow-sm backdrop-blur transition hover:bg-hearth-muted"
            title="Start a focus timer"
          >
            <Play size={13} className="text-productive" /> Start timer
          </button>
          <button
            onClick={() => setLogOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-hearth-border bg-hearth-cream/90 px-3 py-1.5 text-xs text-hearth-text shadow-sm backdrop-blur transition hover:bg-hearth-muted"
            title="Log manual hours"
          >
            <PenLine size={13} className="text-explained" /> Log hours
          </button>
        </div>
        <ManualHoursModal open={logOpen} onClose={() => setLogOpen(false)} />
      </>
    )
  }

  const total = t.activeSec + t.explainedSec + t.unexplainedSec + t.pendingIdleSec || 1
  const pct = (n: number) => `${(n / total) * 100}%`

  return (
    <div className="fixed left-1/2 top-[60px] z-30 w-[min(92vw,30rem)] -translate-x-1/2 overflow-hidden rounded-xl border border-hearth-border bg-hearth-cream/95 shadow-lg backdrop-blur">
      <div className="flex items-center gap-3 px-3 py-2">
        <span
          className={cn(
            'h-2.5 w-2.5 shrink-0 rounded-full',
            t.idlePrompt ? 'animate-pulse bg-unexplained' : 'bg-productive',
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-hearth-green">
            {t.task?.title ?? 'Focus session'}
          </div>
          <div className="text-[11px] text-hearth-text/50">
            {t.idlePrompt ? 'Paused — are you still working?' : 'Tracking active work'}
          </div>
        </div>
        <span className="shrink-0 font-mono text-sm tabular-nums text-hearth-green">
          {clock(t.activeSec)}
        </span>
        <button
          onClick={t.stop}
          className="shrink-0 rounded-lg bg-hearth-muted p-1.5 text-hearth-green transition hover:bg-hearth-border"
          title="Stop session"
        >
          <Pause size={16} />
        </button>
      </div>

      {/* Green / yellow / red proportions */}
      <div className="flex h-1 w-full">
        <div className="bg-productive" style={{ width: pct(t.activeSec) }} />
        <div className="bg-explained" style={{ width: pct(t.explainedSec) }} />
        <div className="bg-unexplained" style={{ width: pct(t.unexplainedSec + t.pendingIdleSec) }} />
      </div>

      {t.idlePrompt && (
        <div className="border-t border-hearth-border p-2">
          <div className="mb-1.5 px-1 text-[11px] text-hearth-text/60">
            What happened? (logs the last {clock(t.pendingIdleSec)} as explained)
          </div>
          <div className="grid grid-cols-3 gap-1">
            {REASONS.map((r) => (
              <button
                key={r.value}
                onClick={() => t.explainIdle(r.value)}
                className="rounded-lg bg-hearth-muted px-2 py-1.5 text-xs text-hearth-green transition hover:bg-hearth-border"
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={t.dismissIdle}
            className="mt-1 w-full rounded-lg px-2 py-1 text-[11px] text-hearth-text/50 hover:text-hearth-green"
          >
            I stepped away (count as unexplained)
          </button>
        </div>
      )}
    </div>
  )
}
