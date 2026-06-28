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

  // Mirrors `running` synchronously so always-on visibility listeners see
  // the current value even during the async Supabase insert in start().
  const runningRef = useRef(false)

  // Paused flag mirrors idleNotice !== null; used as a ref for the ticker.
  const pausedRef = useRef(false)

  // Timestamp-based accumulators — immune to interval throttling.
  const activeAccumRef      = useRef(0)
  const activeStartRef      = useRef<number | null>(null)
  const unexplainedAccumRef = useRef(0)

  // Tracks when the user left so we can report how long the timer was paused.
  const awyStartRef        = useRef<number | null>(null)
  const awayNoticeTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Idle tracker (separate concern) ──────────────────────────────────────
  // Disabled while paused so it doesn't re-fire during the notice banner.
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

  function showAwayNotice(awaySec: number) {
    if (awayNoticeTimer.current) clearTimeout(awayNoticeTimer.current)
    const mins = Math.round(awaySec / 60)
    setAwayNotice(mins > 0 ? `Timer paused for ${mins} min while you were away` : 'Timer paused while you were away')
    awayNoticeTimer.current = setTimeout(() => setAwayNotice(null), 5000)
  }

  // ── Idle event listener ───────────────────────────────────────────────────
  // The idle tracker fires this event; the timer reacts by rewinding and pausing.

  useEffect(() => {
    if (!running) return

    function onIdleDetected(e: Event) {
      const { rewindSec } = (e as CustomEvent<IdleDetectedDetail>).detail

      // Commit whatever active time has accumulated up to now.
      commitActiveAt(Date.now())

      // Rewind: subtract up to rewindSec from the active accumulator.
      const rewound = Math.min(activeAccumRef.current, rewindSec)
      activeAccumRef.current -= rewound
      unexplainedAccumRef.current += rewound

      // Freeze the active stretch.
      activeStartRef.current = null
      pausedRef.current = true

      // Update display.
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

  // ── Visibility / focus (always-on, mounted once) ──────────────────────────

  useEffect(() => {
    function onHide() {
      if (!runningRef.current || appHiddenRef.current) return
      appHiddenRef.current = true
      // Freeze active time the moment focus leaves — don't count other-app time.
      commitActiveAt(Date.now())
      activeStartRef.current = null
      awyStartRef.current = Date.now()
    }

    function onShow() {
      if (!runningRef.current || !appHiddenRef.current) return
      appHiddenRef.current = false

      // Report how long the timer was frozen if it was a meaningful absence.
      if (awyStartRef.current !== null) {
        const awaySec = Math.floor((Date.now() - awyStartRef.current) / 1000)
        awyStartRef.current = null
        if (awaySec >= 60) showAwayNotice(awaySec)
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
      if (appHiddenRef.current) return
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
    setAwayNotice(null)
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
