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
    window.addEventListener('focus', () => recordActivity('window:focus'))
    function onVisibilityChange() {
      if (!document.hidden) {
        log('visibilitychange → visible, resetting idle clock')
        recordActivity('visibilitychange:visible')
      } else {
        log('visibilitychange → hidden, idle clock paused by document.hidden check')
      }
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

    const id = setInterval(() => {
      if (document.hidden) {
        // too noisy to log every tick — skip silently
        return
      }
      if (!document.hasFocus()) {
        // also skip silently to avoid log spam
        return
      }
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
