import type { IdleReason } from '@/lib/types'
import { useTimer } from './TimerProvider'

function clock(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const REASONS: { value: IdleReason; label: string }[] = [
  { value: 'reading',  label: 'Reading'  },
  { value: 'thinking', label: 'Thinking' },
  { value: 'meeting',  label: 'Meeting'  },
  { value: 'call',     label: 'Call'     },
  { value: 'bathroom', label: 'Break'    },
  { value: 'other',    label: 'Other'    },
]

/** Shows the idle prompt in the bottom-left corner when the timer detects inactivity. */
export function TimerBar() {
  const t = useTimer()
  if (!t.running || !t.idlePrompt) return null

  return (
    <div className="fixed bottom-24 left-6 z-40 w-64 animate-fade-up">
      <div className="glass overflow-hidden rounded-2xl border border-hearth-gold/30 shadow-lg">
        <div className="px-4 pt-3 pb-1">
          <div className="mb-0.5 text-xs font-semibold text-hearth-gold">Timer paused</div>
          <div className="mb-2.5 text-[11px] text-hearth-text/60">
            What happened? Logs the last {clock(t.pendingIdleSec)} as explained time.
          </div>
          <div className="grid grid-cols-3 gap-1">
            {REASONS.map((r) => (
              <button
                key={r.value}
                onClick={() => t.explainIdle(r.value)}
                className="rounded-lg bg-hearth-muted px-2 py-1.5 text-[11px] text-hearth-green transition hover:bg-hearth-border"
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={t.dismissIdle}
            className="mt-1.5 w-full rounded-lg px-2 py-1 text-[10px] text-hearth-text/45 transition hover:text-hearth-green"
          >
            Stepped away — count as unexplained
          </button>
        </div>

        {/* Green / yellow / red bar */}
        <div className="mt-2 flex h-1 w-full">
          {(() => {
            const total = t.activeSec + t.explainedSec + t.unexplainedSec + t.pendingIdleSec || 1
            const pct = (n: number) => `${(n / total) * 100}%`
            return (
              <>
                <div className="bg-productive" style={{ width: pct(t.activeSec) }} />
                <div className="bg-explained" style={{ width: pct(t.explainedSec) }} />
                <div className="bg-unexplained" style={{ width: pct(t.unexplainedSec + t.pendingIdleSec) }} />
              </>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

export function timerClock(sec: number) { return clock(sec) }
