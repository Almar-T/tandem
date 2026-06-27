import { useTimer } from './TimerProvider'

function clock(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Shows the idle notice banner when the timer detects inactivity and rewinds time. */
export function TimerBar() {
  const t = useTimer()
  if (!t.running || !t.idleNotice) return null

  return (
    <div className="fixed bottom-24 left-6 z-40 w-72 animate-fade-up">
      <div className="glass overflow-hidden rounded-2xl border border-hearth-gold/30 shadow-lg">
        <div className="px-4 py-3">
          <div className="mb-1 text-xs font-semibold text-hearth-gold">Timer paused</div>
          <div className="mb-3 text-[11px] leading-relaxed text-hearth-text/70">
            {t.idleNotice}
          </div>
          <button
            onClick={t.resumeFromIdle}
            className="w-full rounded-lg bg-hearth-green px-3 py-1.5 text-xs font-medium text-hearth-cream transition hover:bg-hearth-text"
          >
            Resume
          </button>
        </div>

        {/* Active time bar */}
        <div className="h-1 w-full bg-productive/30">
          <div
            className="h-full bg-productive transition-all duration-300"
            style={{ width: `${Math.min((t.activeSec / Math.max(t.activeSec + 300, 1)) * 100, 100)}%` }}
          />
        </div>
      </div>
    </div>
  )
}

export function timerClock(sec: number) { return clock(sec) }
