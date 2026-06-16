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
import type { IdleReason, Task } from '@/lib/types'

const IDLE_THRESHOLD_SEC = 120

interface TimerCtx {
  task: Task | null
  running: boolean
  activeSec: number
  explainedSec: number
  unexplainedSec: number
  pendingIdleSec: number
  idlePrompt: boolean
  start: (task?: Task | null) => void
  stop: () => void
  explainIdle: (reason: IdleReason) => void
  dismissIdle: () => void
}

const Ctx = createContext<TimerCtx | undefined>(undefined)

export function TimerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const qc = useQueryClient()

  const [task, setTask]                   = useState<Task | null>(null)
  const [running, setRunning]             = useState(false)
  const [activeSec, setActiveSec]         = useState(0)
  const [explainedSec, setExplainedSec]   = useState(0)
  const [unexplainedSec, setUnexplainedSec] = useState(0)
  const [pendingIdleSec, setPendingIdleSec] = useState(0)
  const [idlePrompt, setIdlePrompt]       = useState(false)

  const sessionIdRef       = useRef<string | null>(null)
  const idlePromptRef      = useRef(false)
  const reasonRef          = useRef<IdleReason | null>(null)
  const lastActivityRef    = useRef(Date.now())
  const appHiddenRef       = useRef(false)
  const hiddenAtRef        = useRef<number | null>(null) // when tab went to background

  // Timestamp-based accumulators — immune to interval throttling.
  // Time is always computed as (Date.now() - startTimestamp), so a slow
  // interval only affects display refresh rate, never accuracy.
  const activeAccumRef        = useRef(0)              // completed active seconds
  const activeStartRef        = useRef<number | null>(null) // ms when current active stretch began
  const idlePromptStartRef    = useRef<number | null>(null) // ms when idle prompt appeared
  const explainedAccumRef     = useRef(0)
  const unexplainedAccumRef   = useRef(0)

  // ── Helpers (read refs, never stale) ────────────────────────────────────

  function calcActiveSec(): number {
    return activeAccumRef.current + (
      activeStartRef.current !== null
        ? Math.floor((Date.now() - activeStartRef.current) / 1000)
        : 0
    )
  }

  function calcPendingIdleSec(): number {
    return idlePromptStartRef.current !== null
      ? Math.floor((Date.now() - idlePromptStartRef.current) / 1000)
      : 0
  }

  // Commit current active stretch to accumulator, up to a specific wall-clock time.
  function commitActiveAt(atMs: number) {
    if (activeStartRef.current !== null) {
      activeAccumRef.current += Math.floor((atMs - activeStartRef.current) / 1000)
      activeStartRef.current = null
    }
  }

  // ── Input activity listener ──────────────────────────────────────────────

  useEffect(() => {
    function onActivity() {
      lastActivityRef.current = Date.now()
      if (idlePromptRef.current) {
        // User came back while idle prompt was showing — mark as unexplained.
        const pending = calcPendingIdleSec()
        unexplainedAccumRef.current += pending
        setUnexplainedSec(unexplainedAccumRef.current)
        idlePromptStartRef.current = null
        idlePromptRef.current = false
        setIdlePrompt(false)
        setPendingIdleSec(0)
        // Begin fresh active stretch.
        activeStartRef.current = Date.now()
      }
    }
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart']
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    return () => events.forEach((e) => window.removeEventListener(e, onActivity))
  }, [])

  // ── Visibility listener ─────────────────────────────────────────────────
  // On hide: freeze the active stretch so background time isn't auto-counted.
  // On show:
  //   • Short absence (< IDLE_THRESHOLD): resume as active — just a quick switch.
  //   • Long absence (≥ IDLE_THRESHOLD): show the idle prompt so the user can
  //     classify that time as work, break, etc. Same flow as normal idle.

  useEffect(() => {
    if (!running) return
    function onVisibility() {
      const now = Date.now()
      if (document.hidden) {
        appHiddenRef.current = true
        hiddenAtRef.current = now
        // Freeze active time at the moment we left.
        commitActiveAt(now)
      } else {
        appHiddenRef.current = false
        const hiddenAt = hiddenAtRef.current ?? now
        const awayMs = now - hiddenAt
        hiddenAtRef.current = null

        if (awayMs < IDLE_THRESHOLD_SEC * 1000) {
          // Brief switch — treat the gap as active and keep going.
          activeStartRef.current = now
        } else if (!idlePromptRef.current) {
          // Long absence — trigger the idle prompt exactly as if the user
          // had been sitting idle at the keyboard.
          idlePromptStartRef.current = hiddenAt + IDLE_THRESHOLD_SEC * 1000
          idlePromptRef.current = true
          setIdlePrompt(true)
          setPendingIdleSec(Math.floor((now - idlePromptStartRef.current) / 1000))
        }

        lastActivityRef.current = now
        setActiveSec(calcActiveSec())
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [running])

  // ── Ticker ───────────────────────────────────────────────────────────────
  // Fires ~every second but may be throttled in background to once per minute.
  // All time values derive from Date.now() so accuracy is preserved regardless.

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const now = Date.now()

      // While hidden: active time is frozen (committed on hide).
      // The visibilitychange handler handles the return — skip all tick logic.
      if (appHiddenRef.current) return

      if (idlePromptRef.current) {
        // Idle prompt is showing — just refresh the display counter.
        setPendingIdleSec(calcPendingIdleSec())
        return
      }

      const sinceActivity = now - lastActivityRef.current

      if (sinceActivity >= IDLE_THRESHOLD_SEC * 1000) {
        // Crossed the idle threshold — commit active time up to last activity.
        commitActiveAt(lastActivityRef.current)
        if (!idlePromptStartRef.current) {
          idlePromptStartRef.current = lastActivityRef.current + IDLE_THRESHOLD_SEC * 1000
        }
        setActiveSec(activeAccumRef.current)
        setPendingIdleSec(calcPendingIdleSec())
        idlePromptRef.current = true
        setIdlePrompt(true)
      } else {
        // Actively working.
        if (activeStartRef.current === null) {
          activeStartRef.current = now
        }
        setActiveSec(calcActiveSec())
      }
    }, 1000)
    return () => clearInterval(id)
  }, [running])

  // ── Public actions ───────────────────────────────────────────────────────

  async function start(next?: Task | null) {
    if (sessionIdRef.current) await stop()
    const { data } = await supabase
      .from('work_sessions')
      .insert({ task_id: next?.id ?? null, user_id: user?.id })
      .select('id')
      .single()
    sessionIdRef.current = data?.id ?? null
    setTask(next ?? null)

    // Reset all accumulators.
    activeAccumRef.current      = 0
    activeStartRef.current      = Date.now()
    idlePromptStartRef.current  = null
    explainedAccumRef.current   = 0
    unexplainedAccumRef.current = 0
    reasonRef.current           = null
    lastActivityRef.current     = Date.now()
    idlePromptRef.current       = false

    setActiveSec(0)
    setExplainedSec(0)
    setUnexplainedSec(0)
    setPendingIdleSec(0)
    setIdlePrompt(false)
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
    const wasIdle = idlePromptRef.current
    setRunning(false)
    setIdlePrompt(false)
    idlePromptRef.current = false
    const id = sessionIdRef.current
    sessionIdRef.current = null

    if (id) {
      commitActiveAt(Date.now())
      const unexplained = unexplainedAccumRef.current + (wasIdle ? calcPendingIdleSec() : 0)
      await supabase
        .from('work_sessions')
        .update({
          ended_at: new Date().toISOString(),
          active_sec: activeAccumRef.current,
          idle_explained_sec: explainedAccumRef.current,
          idle_unexplained_sec: unexplained,
          idle_reason: reasonRef.current,
        })
        .eq('id', id)
      qc.invalidateQueries({ queryKey: ['tasks'] })
    }
    setTask(null)
  }

  function explainIdle(reason: IdleReason) {
    const pending = calcPendingIdleSec()
    explainedAccumRef.current += pending
    reasonRef.current = reason
    idlePromptStartRef.current = null
    idlePromptRef.current = false
    setPendingIdleSec(0)
    setExplainedSec(explainedAccumRef.current)
    setIdlePrompt(false)
    lastActivityRef.current = Date.now()
    activeStartRef.current  = Date.now()
  }

  function dismissIdle() {
    const pending = calcPendingIdleSec()
    unexplainedAccumRef.current += pending
    idlePromptStartRef.current = null
    idlePromptRef.current = false
    setPendingIdleSec(0)
    setUnexplainedSec(unexplainedAccumRef.current)
    setIdlePrompt(false)
    lastActivityRef.current = Date.now()
    activeStartRef.current  = Date.now()
  }

  return (
    <Ctx.Provider
      value={{
        task,
        running,
        activeSec,
        explainedSec,
        unexplainedSec,
        pendingIdleSec,
        idlePrompt,
        start,
        stop,
        explainIdle,
        dismissIdle,
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
