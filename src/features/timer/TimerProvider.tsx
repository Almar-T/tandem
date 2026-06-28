import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import type { Task } from '@/lib/types'
import {
  useIdleTracker,
  IDLE_DETECTED_EVENT,
  IDLE_THRESHOLD_SEC,
  type IdleDetectedDetail,
} from './useIdleTracker'

interface TimerCtx {
  task: Task | null
  running: boolean
  activeSec: number
  idleNotice: string | null
  awayNotice: string | null
  startError: string | null
  start: (task?: Task | null) => void
  stop: () => void
  resumeFromIdle: () => void
  dismissAwayNotice: () => void
  recordActivity: () => void
}

const Ctx = createContext<TimerCtx | undefined>(undefined)

export function TimerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const qc = useQueryClient()

  const [task, setTask]           = useState<Task | null>(null)
  const [running, setRunning]     = useState(false)
  const [activeSec, setActiveSec] = useState(0)
  const [idleNotice, setIdleNotice] = useState<string | null>(null)
  const [awayNotice, setAwayNotice] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)

  const sessionIdRef      = useRef<string | null>(null)
  const appHiddenRef      = useRef(false)
  const runningRef        = useRef(false)
  const pausedRef         = useRef(false)

  const activeAccumRef      = useRef(0)
  const activeStartRef      = useRef<number | null>(null)
  const unexplainedAccumRef = useRef(0)

  // Tauri companion tracking state
  const lastTauriSignalRef  = useRef(0)       // ms timestamp of last desktop_activity INSERT
  const activeAccumAtHideRef = useRef(0)      // accumulator snapshot taken in onHide

  // Away notice auto-dismiss
  const awyStartRef         = useRef<number | null>(null)
  const awayNoticeTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Idle tracker ──────────────────────────────────────────────────────────
  const paused = idleNotice !== null
  const { recordActivity } = useIdleTracker(running && !paused)

  // ── Helpers ───────────────────────────────────────────────────────────────

  function calcActiveSec(): number {
    return activeAccumRef.current + (
      activeStartRef.current !== null
        ? Math.floor((Date.now() - activeStartRef.current) / 1000)
        : 0
    )
  }

  function commitActiveAt(atMs: number) {
    if (activeStartRef.current !== null) {
      activeAccumRef.current += Math.floor((atMs - activeStartRef.current) / 1000)
      activeStartRef.current = null
    }
  }

  function dismissAwayNotice() {
    if (awayNoticeTimer.current) clearTimeout(awayNoticeTimer.current)
    setAwayNotice(null)
  }

  function showAwayNotice(msg: string) {
    if (awayNoticeTimer.current) clearTimeout(awayNoticeTimer.current)
    setAwayNotice(msg)
    awayNoticeTimer.current = setTimeout(() => setAwayNotice(null), 6000)
  }

  // Called when the Tauri desktop companion inserts a row into desktop_activity.
  // This is how Tauri signals "the user is actively working in another app."
  // We resume the frozen timer and record the signal time so the ticker can
  // detect when Tauri goes quiet again.
  function onTauriActivity() {
    if (!runningRef.current) return
    lastTauriSignalRef.current = Date.now()
    recordActivity() // also reset in-tab idle clock
    // If the timer was frozen because the window lost focus, resume it now
    // that Tauri has confirmed the user is actively working elsewhere.
    if (appHiddenRef.current && !pausedRef.current && activeStartRef.current === null) {
      activeStartRef.current = Date.now()
    }
  }

  // ── Idle event listener ───────────────────────────────────────────────────

  useEffect(() => {
    if (!running) return

    function onIdleDetected(e: Event) {
      const { rewindSec } = (e as CustomEvent<IdleDetectedDetail>).detail
      commitActiveAt(Date.now())
      const rewound = Math.min(activeAccumRef.current, rewindSec)
      activeAccumRef.current -= rewound
      unexplainedAccumRef.current += rewound
      activeStartRef.current = null
      pausedRef.current = true
      setActiveSec(activeAccumRef.current)
      const mins = Math.round(rewound / 60)
      setIdleNotice(
        mins > 0
          ? `Timer paused — ${mins} min removed for inactivity`
          : 'Timer paused due to inactivity',
      )
    }

    window.addEventListener(IDLE_DETECTED_EVENT, onIdleDetected)
    return () => window.removeEventListener(IDLE_DETECTED_EVENT, onIdleDetected)
  }, [running])

  // ── Tauri companion Realtime feed ─────────────────────────────────────────
  // Each INSERT into desktop_activity means Tauri confirmed the user is
  // active in another app. We use this to resume the frozen timer and to
  // know when to freeze it again (when Tauri goes quiet).

  useEffect(() => {
    if (!running || !user) return
    const channel = supabase
      .channel('tauri-heartbeat')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'desktop_activity', filter: `user_id=eq.${user.id}` },
        () => { onTauriActivity() },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [running, user])

  // ── Visibility / focus ────────────────────────────────────────────────────

  useEffect(() => {
    function onHide() {
      if (!runningRef.current || appHiddenRef.current) return
      appHiddenRef.current = true
      // Freeze by default — Tauri will unfreeze if the user is actively working.
      commitActiveAt(Date.now())
      activeStartRef.current = null
      // Snapshot the accumulator so onShow can calculate how much Tauri added.
      activeAccumAtHideRef.current = activeAccumRef.current
      awyStartRef.current = Date.now()
    }

    function onShow() {
      if (!runningRef.current || !appHiddenRef.current) return
      appHiddenRef.current = false

      // Commit any Tauri-driven time that was still in progress.
      commitActiveAt(Date.now())

      if (awyStartRef.current !== null) {
        const awaySec = Math.floor((Date.now() - awyStartRef.current) / 1000)
        awyStartRef.current = null
        const tauriGainedSec = activeAccumRef.current - activeAccumAtHideRef.current
        if (tauriGainedSec >= 60) {
          const mins = Math.round(tauriGainedSec / 60)
          showAwayNotice(`Tauri tracked ${mins} min in other apps while you were away`)
        } else if (awaySec >= 30) {
          const mins = Math.round(awaySec / 60)
          showAwayNotice(
            mins > 0
              ? `Timer paused for ${mins} min while you were away`
              : 'Timer was paused while you were away',
          )
        }
      }

      if (activeStartRef.current === null && !pausedRef.current) {
        activeStartRef.current = Date.now()
      }
      setActiveSec(calcActiveSec())
    }

    function onVisibilityChange() {
      if (document.hidden) onHide()
      else onShow()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('blur', onHide)
    window.addEventListener('focus', onShow)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('blur', onHide)
      window.removeEventListener('focus', onShow)
    }
  }, [])

  // ── Ticker ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      if (document.hidden) return
      if (pausedRef.current) return

      if (appHiddenRef.current) {
        if (activeStartRef.current !== null) {
          // Tauri was keeping the timer running. If it has gone quiet for longer
          // than the idle threshold, commit only up to the last confirmed signal
          // and freeze — don't credit the silent gap.
          const tauriSilentMs = Date.now() - lastTauriSignalRef.current
          if (tauriSilentMs >= IDLE_THRESHOLD_SEC * 1000) {
            commitActiveAt(lastTauriSignalRef.current)
          } else {
            setActiveSec(calcActiveSec())
          }
        }
        return
      }

      if (activeStartRef.current === null) activeStartRef.current = Date.now()
      setActiveSec(calcActiveSec())
    }, 1000)
    return () => clearInterval(id)
  }, [running])

  // ── Public actions ────────────────────────────────────────────────────────

  async function start(next?: Task | null) {
    if (sessionIdRef.current) await stop()

    setStartError(null)
    setIdleNotice(null)
    setAwayNotice(null)
    pausedRef.current = false
    runningRef.current = true
    appHiddenRef.current = document.hidden || !document.hasFocus()

    let sessionId: string | null = null
    try {
      const { data, error } = await supabase
        .from('work_sessions')
        .insert({ task_id: next?.id ?? null, user_id: user?.id })
        .select('id')
        .single()
      if (error) throw error
      sessionId = data.id
    } catch (err) {
      console.error('Failed to start timer session:', err)
      runningRef.current = false
      appHiddenRef.current = false
      setStartError('Could not start — check your connection and try again.')
      return
    }

    sessionIdRef.current = sessionId
    setTask(next ?? null)

    activeAccumRef.current      = 0
    activeStartRef.current      = appHiddenRef.current ? null : Date.now()
    unexplainedAccumRef.current = 0
    lastTauriSignalRef.current  = 0
    activeAccumAtHideRef.current = 0

    setActiveSec(0)
    setRunning(true)

    if (next) {
      await supabase
        .from('tasks')
        .update({ status: 'in_progress' })
        .eq('id', next.id)
        .eq('status', 'not_started')
      qc.invalidateQueries({ queryKey: ['tasks'] })
    }
  }

  async function stop() {
    runningRef.current = false
    pausedRef.current = false
    setRunning(false)
    setIdleNotice(null)
    dismissAwayNotice()

    const id = sessionIdRef.current
    sessionIdRef.current = null

    if (id) {
      commitActiveAt(Date.now())
      await supabase
        .from('work_sessions')
        .update({
          ended_at: new Date().toISOString(),
          active_sec: activeAccumRef.current,
          idle_explained_sec: 0,
          idle_unexplained_sec: unexplainedAccumRef.current,
          idle_reason: null,
        })
        .eq('id', id)
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['work_sessions'] })
    }
    setTask(null)
  }

  function resumeFromIdle() {
    recordActivity()
    pausedRef.current = false
    activeStartRef.current = Date.now()
    setIdleNotice(null)
  }

  return (
    <Ctx.Provider
      value={{
        task,
        running,
        activeSec,
        idleNotice,
        awayNotice,
        startError,
        start,
        stop,
        resumeFromIdle,
        dismissAwayNotice,
        recordActivity,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTimer() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTimer must be used within <TimerProvider>')
  return ctx
}
