import { type MutableRefObject, useCallback, useEffect, useRef } from 'react'

export const IDLE_DETECTED_EVENT = 'tandem:idle-detected'

export const IDLE_THRESHOLD_SEC = 120
export const IDLE_REWIND_SEC = 300

export interface IdleDetectedDetail {
  rewindSec: number
}

const log = (...args: unknown[]) => console.log('[idle]', ...args)

// tauriSignalRef: ref to lastTauriSignalRef from TimerProvider (0 = Tauri never
// connected this session). When Tauri has signalled, idle is system-wide and the
// interval runs regardless of focus/visibility. Without Tauri it falls back to
// the original in-tab-only behaviour to avoid false idle fires while working in
// other apps.
export function useIdleTracker(
  enabled: boolean,
  tauriSignalRef?: MutableRefObject<number>,
) {
  const lastActivityRef = useRef(Date.now())
  const firedRef = useRef(false)
  const lastMousePos = useRef({ x: -Infinity, y: -Infinity })

  const recordActivity = useCallback((source = 'unknown') => {
    const prev = lastActivityRef.current
    lastActivityRef.current = Date.now()
    firedRef.current = false
    log(`recordActivity source=${source} prev=${Math.round((Date.now() - prev) / 1000)}s ago`)
  }, [])

  useEffect(() => {
    // Keyboard + non-mouse pointer events reset the clock directly.
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart']
    events.forEach((e) => window.addEventListener(e, () => recordActivity(e), { passive: true }))

    // Mouse movement uses a deadzone to ignore sub-5 px jitter from optical
    // sensors or trackpad vibration — only intentional movement counts.
    const onMouseMove = (e: MouseEvent) => {
      const dx = Math.abs(e.clientX - lastMousePos.current.x)
      const dy = Math.abs(e.clientY - lastMousePos.current.y)
      if (dx >= 5 || dy >= 5) {
        lastMousePos.current = { x: e.clientX, y: e.clientY }
        recordActivity('mousemove')
      }
    }
    window.addEventListener('mousemove', onMouseMove, { passive: true })

    // window:focus is intentionally NOT registered here. macOS notifications,
    // Spotlight, system dialogs etc. briefly steal focus then return it, firing
    // focus events that silently reset the idle clock without any real user input.
    // Actual user return is detected by their first mouse/keyboard event.
    function onVisibilityChange() {
      if (!document.hidden) {
        // Only reset the idle clock on visibility change when Tauri is NOT
        // active — with Tauri, returning to the page is not a user action and
        // must not mask Tauri-silence-based idle detection.
        const tauriActive = tauriSignalRef ? tauriSignalRef.current > 0 : false
        if (!tauriActive) {
          log('visibilitychange → visible, resetting idle clock (no Tauri)')
          recordActivity('visibilitychange:visible')
        } else {
          log('visibilitychange → visible (Tauri active, idle clock keeps ticking)')
        }
      } else {
        log('visibilitychange → hidden')
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      events.forEach((e) => window.removeEventListener(e, () => recordActivity(e)))
      window.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [recordActivity, tauriSignalRef])

  useEffect(() => {
    log(`idle tracker ${enabled ? 'ENABLED' : 'DISABLED'}`)
    if (!enabled) {
      firedRef.current = false
      return
    }

    const id = setInterval(() => {
      // When Tauri has connected this session, run unconditionally — idle is
      // driven by absence of Tauri heartbeats (system-wide). Without Tauri,
      // keep the original guards so working in another app doesn't trigger idle.
      const tauriActive = tauriSignalRef ? tauriSignalRef.current > 0 : false
      if (!tauriActive) {
        if (document.hidden) return
        if (!document.hasFocus()) return
      }

      if (firedRef.current) return

      const idleMs = Date.now() - lastActivityRef.current
      const idleSec = Math.round(idleMs / 1000)

      if (idleSec > 0 && idleSec % 10 === 0) {
        log(`idle tick: ${idleSec}s / ${IDLE_THRESHOLD_SEC}s threshold (tauriActive=${tauriActive})`)
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
  }, [enabled, tauriSignalRef])

  return { recordActivity: (source?: string) => recordActivity(source ?? 'external') }
}
