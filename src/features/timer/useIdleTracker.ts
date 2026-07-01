import { useCallback, useEffect, useRef } from 'react'

export const IDLE_DETECTED_EVENT = 'tandem:idle-detected'

export const IDLE_THRESHOLD_SEC = 120
export const IDLE_REWIND_SEC = 300

export interface IdleDetectedDetail {
  rewindSec: number
}

const log = (...args: unknown[]) => console.log('[idle]', ...args)

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
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart']
    events.forEach((e) => window.addEventListener(e, () => recordActivity(e), { passive: true }))
    // Clicking or keyboard-navigating back into the window is real user activity.
    window.addEventListener('focus', () => recordActivity('window:focus'))
    // Visibility change is NOT user activity — the idle clock must keep ticking
    // so that Tauri's absence-of-signal can be detected even while the screen
    // is asleep or the window is in the background.
    function onVisibilityChange() {
      log(`visibilitychange → ${document.hidden ? 'hidden' : 'visible'} (idle clock keeps ticking)`)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      events.forEach((e) => window.removeEventListener(e, () => recordActivity(e)))
      window.removeEventListener('focus', () => recordActivity('window:focus'))
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [recordActivity])

  useEffect(() => {
    log(`idle tracker ${enabled ? 'ENABLED' : 'DISABLED'}`)
    if (!enabled) {
      firedRef.current = false
      return
    }

    // The interval runs unconditionally regardless of document visibility or
    // focus. Idle is detected by the absence of Tauri heartbeat signals
    // (system-wide activity tracked by the desktop companion). Those signals
    // call recordActivity('tauri') via Realtime, resetting the clock while
    // the user is active anywhere on the system. When Tauri stops signalling
    // (system idle ≥ 60 s), this clock reaches IDLE_THRESHOLD_SEC and fires.
    const id = setInterval(() => {
      if (firedRef.current) return

      const idleMs = Date.now() - lastActivityRef.current
      const idleSec = Math.round(idleMs / 1000)

      if (idleSec > 0 && idleSec % 10 === 0) {
        log(`idle tick: ${idleSec}s / ${IDLE_THRESHOLD_SEC}s threshold`)
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
