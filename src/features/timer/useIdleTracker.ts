import { useCallback, useEffect, useRef } from 'react'

export const IDLE_DETECTED_EVENT = 'tandem:idle-detected'

// How long without in-tab input before idle fires (seconds).
export const IDLE_THRESHOLD_SEC = 120

// How many seconds to rewind active time when idle is detected.
export const IDLE_REWIND_SEC = 300

export interface IdleDetectedDetail {
  rewindSec: number
}

// Standalone idle detector. When enabled, polls every second and dispatches
// IDLE_DETECTED_EVENT on the window when the tab is visible + focused but
// no user input has been seen for IDLE_THRESHOLD_SEC seconds.
//
// Window blur (user switched to another app or tab) resets the idle clock —
// they are still working, just not here. Idle only fires for genuine
// "screen is untouched" situations.
//
// Computer-wide detection (other apps, global key/mouse hooks) is physically
// impossible from a browser PWA. Phase 10 Tauri companion can dispatch this
// same IDLE_DETECTED_EVENT from native input hooks without any changes here.
export function useIdleTracker(enabled: boolean) {
  const lastActivityRef = useRef(Date.now())
  const firedRef = useRef(false)

  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now()
    firedRef.current = false
  }, [])

  // Always track in-tab activity so lastActivityRef stays fresh even when disabled.
  // NOTE: blur is intentionally NOT treated as activity. Switching away from the tab
  // doesn't mean the user is active — Tauri/extension will call recordActivity() via
  // their Supabase Realtime feeds if the user is genuinely working in another app.
  // focus IS treated as activity: returning to the tab means the user is back.
  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart']
    events.forEach((e) => window.addEventListener(e, recordActivity, { passive: true }))
    window.addEventListener('focus', recordActivity)
    return () => {
      events.forEach((e) => window.removeEventListener(e, recordActivity))
      window.removeEventListener('focus', recordActivity)
    }
  }, [recordActivity])

  useEffect(() => {
    if (!enabled) {
      firedRef.current = false
      return
    }

    const id = setInterval(() => {
      // Skip when the tab is hidden or when the window doesn't have focus.
      // Idle should only fire when the user is actually looking at this tab
      // and not touching anything — not while they're in another app.
      if (document.hidden) return
      if (!document.hasFocus()) return
      if (firedRef.current) return

      const idleMs = Date.now() - lastActivityRef.current
      if (idleMs >= IDLE_THRESHOLD_SEC * 1000) {
        firedRef.current = true
        window.dispatchEvent(
          new CustomEvent<IdleDetectedDetail>(IDLE_DETECTED_EVENT, {
            detail: { rewindSec: IDLE_REWIND_SEC },
          }),
        )
      }
    }, 1000)

    return () => clearInterval(id)
  }, [enabled])

  return { recordActivity }
}
