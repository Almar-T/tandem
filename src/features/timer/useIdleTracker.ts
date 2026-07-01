import { type MutableRefObject, useCallback, useEffect, useRef } from 'react'

export const IDLE_DETECTED_EVENT = 'tandem:idle-detected'

export const IDLE_THRESHOLD_SEC = 120
export const IDLE_REWIND_SEC = 300

export interface IdleDetectedDetail {
  rewindSec: number
}

const log = (...args: unknown[]) => console.log('[idle]', ...args)

export function useIdleTracker(
  enabled: boolean,
  tauriSignalRef?: MutableRefObject<number>,
) {
  const lastActivityRef = useRef(Date.now())
  const firedRef = useRef(false)
  const lastMousePos = useRef({ x: -Infinity, y: -Infinity })

  const recordActivity = useCallback((source = 'unknown') => {
    // When Tauri is connected it tracks keyboard/mouse system-wide, so
    // browser events are redundant and must not reset the idle clock —
    // only Tauri heartbeats count. Without Tauri, browser events are
    // the only signal available so they're allowed through.
    const tauriConnected = tauriSignalRef ? tauriSignalRef.current > 0 : false
    if (tauriConnected && source !== 'tauri') {
      return
    }
    const prev = lastActivityRef.current
    lastActivityRef.current = Date.now()
    firedRef.current = false
    log(`recordActivity source=${source} prev=${Math.round((Date.now() - prev) / 1000)}s ago`)
  }, [tauriSignalRef])

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart']
    events.forEach((e) => window.addEventListener(e, () => recordActivity(e), { passive: true }))

    const onMouseMove = (e: MouseEvent) => {
      const dx = Math.abs(e.clientX - lastMousePos.current.x)
      const dy = Math.abs(e.clientY - lastMousePos.current.y)
      if (dx >= 5 || dy >= 5) {
        lastMousePos.current = { x: e.clientX, y: e.clientY }
        recordActivity('mousemove')
      }
    }
    window.addEventListener('mousemove', onMouseMove, { passive: true })

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        const tauriConnected = tauriSignalRef ? tauriSignalRef.current > 0 : false
        if (!tauriConnected) recordActivity('visibilitychange:visible')
      }
    })

    return () => {
      events.forEach((e) => window.removeEventListener(e, () => recordActivity(e)))
      window.removeEventListener('mousemove', onMouseMove)
    }
  }, [recordActivity, tauriSignalRef])

  useEffect(() => {
    log(`idle tracker ${enabled ? 'ENABLED' : 'DISABLED'}`)
    if (!enabled) {
      firedRef.current = false
      return
    }

    const id = setInterval(() => {
      const tauriConnected = tauriSignalRef ? tauriSignalRef.current > 0 : false
      // Without Tauri: only fire when the tab is visible and focused (can't
      // tell if user is active in another app). With Tauri: run unconditionally
      // — idle is driven purely by absence of Tauri heartbeats.
      if (!tauriConnected) {
        if (document.hidden) return
        if (!document.hasFocus()) return
      }

      if (firedRef.current) return

      const idleMs = Date.now() - lastActivityRef.current
      const idleSec = Math.round(idleMs / 1000)

      if (idleSec > 0 && idleSec % 10 === 0) {
        log(`idle tick: ${idleSec}s / ${IDLE_THRESHOLD_SEC}s (tauri=${tauriConnected})`)
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
