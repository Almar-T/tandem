import { useCallback, useEffect, useRef } from 'react'

export const IDLE_DETECTED_EVENT = 'tandem:idle-detected'

export const IDLE_THRESHOLD_SEC = 120
export const IDLE_REWIND_SEC = 300

export interface IdleDetectedDetail {
  rewindSec: number
}

const log = (...args: unknown[]) => console.log('[idle]', ...args)

// Activity is tracked solely via explicit recordActivity() calls from Tauri
// heartbeats (system-wide keyboard/mouse) or from returning to the Tandem tab
// as a fallback when HearthHall isn't running. Browser event listeners inside
// the tab are intentionally omitted — they would mask real idle periods when
// the user is active in another app.
export function useIdleTracker(enabled: boolean) {
  const lastActivityRef = useRef(Date.now())
  const firedRef = useRef(false)

  const recordActivity = useCallback((source = 'unknown') => {
    const prev = lastActivityRef.current
    lastActivityRef.current = Date.now()
    firedRef.current = false
    log(`recordActivity source=${source} prev=${Math.round((Date.now() - prev) / 1000)}s ago`)
  }, [])

  useEffect(() => {
    log(`idle tracker ${enabled ? 'ENABLED' : 'DISABLED'}`)
    if (!enabled) {
      firedRef.current = false
      return
    }

    // Reset the clock when the tracker is enabled so the threshold is always
    // measured from the moment the timer (re-)starts, not from page load.
    lastActivityRef.current = Date.now()

    const id = setInterval(() => {
      if (firedRef.current) return

      const idleMs = Date.now() - lastActivityRef.current
      const idleSec = Math.round(idleMs / 1000)

      if (idleSec > 0 && idleSec % 10 === 0) {
        log(`idle tick: ${idleSec}s / ${IDLE_THRESHOLD_SEC}s`)
      }

      if (idleMs >= IDLE_THRESHOLD_SEC * 1000) {
        firedRef.current = true
        log(`IDLE DETECTED after ${idleSec}s — dispatching event`)
        window.dispatchEvent(
          new CustomEvent<IdleDetectedDetail>(IDLE_DETECTED_EVENT, {
            detail: { rewindSec: IDLE_REWIND_SEC },
          }),
        )
      }
    }, 1000)

    return () => clearInterval(id)
  }, [enabled])

  return { recordActivity: (source?: string) => recordActivity(source ?? 'external') }
}
