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
  startError: string | null
  start: (task?: Task | null) => void
  stop: () => void
  explainIdle: (reason: IdleReason) => void
  dismissIdle: () => void
  recordActivity: () => void
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
  const [startError, setStartError]       = useState<string | null>(null)

  const sessionIdRef       = useRef<string | null>(null)
  const idlePromptRef      = useRef(false)
  const reasonRef          = useRef<IdleReason | null>(null)
  const lastActivityRef    = useRef(Date.now())
  const appHiddenRef       = useRef(false)

  // Mirrors `running` state but set synchronously so the always-on
  // visibility listeners (mounted once, dep array []) see the current value
  // even during the async Supabase insert in start().
  const runningRef = useRef(false)

  // Timestamp-based accumulators — immune to interval throttling.
  const activeAccumRef        = useRef(0)
  const activeStartRef        = useRef<number | null>(null)
  const idlePromptStartRef    = useRef<number | null>(null)
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

  function commitActiveAt(atMs: number) {
    if (activeStartRef.current !== null) {
      activeAccumRef.current += Math.floor((atMs - activeStartRef.current) / 1000)
      activeStartRef.current = null
    }
  }

  // ── Input activity listener ──────────────────────────────────────────────
  // Also exposed as `recordActivity` so route changes can signal activity.

  function recordActivity() {
    lastActivityRef.current = Date.now()
    if (idlePromptRef.current) {
      const pending = calcPendingIdleSec()
      unexplainedAccumRef.current += pending
      setUnexplainedSec(unexplainedAccumRef.current)
      idlePromptStartRef.current = null
      idlePromptRef.current = false
      setIdlePrompt(false)
      setPendingIdleSec(0)
      activeStartRef.current = Date.now()
    }
  }

  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart']
    events.forEach((e) => window.addEventListener(e, recordActivity, { passive: true }))
    return () => events.forEach((e) => window.removeEventListener(e, recordActivity))
  }, [])

  // ── Shared activity signal handler ──────────────────────────────────────
  // Called by both the browser-extension Realtime feed and the Tauri heartbeat.
  // Resets the idle timer and resumes the active stretch if it was frozen.

  function onExternalActivity() {
    const now = Date.now()
    lastActivityRef.current = now

    if (idlePromptRef.current) {
      // User was idle; confirmed active elsewhere — count the prompt period as active.
      const pending = calcPendingIdleSec()
      activeAccumRef.current += pending
      idlePromptStartRef.current = null
      idlePromptRef.current = false
      setIdlePrompt(false)
      setPendingIdleSec(0)
    }

    // Restart active stretch if it was frozen by idle detection.
    if (activeStartRef.current === null) activeStartRef.current = now

    if (!document.hidden) setActiveSec(calcActiveSec())
  }

  // ── Browser extension activity feed ─────────────────────────────────────
  // The extension flushes keystrokes + clicks from any tab every ~10 s.
  // When HearthHall receives an INSERT with confirmed interaction, it means
  // the user is working somewhere — reset the idle counter.

  useEffect(() => {
    if (!running || !user) return
    const channel = supabase
      .channel('ext-activity')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'browser_activity',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as { clicks: number; keystrokes: number }
          if ((row.clicks ?? 0) + (row.keystrokes ?? 0) > 0) onExternalActivity()
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [running, user])

  // ── Tauri companion heartbeat ────────────────────────────────────────────

  useEffect(() => {
    if (!running || !user) return
    const channel = supabase
      .channel('tauri-heartbeat')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'desktop_activity',
          filter: `user_id=eq.${user.id}`,
        },
        () => { onExternalActivity() },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [running, user])

  // ── Visibility / focus listeners (always-on, mounted once) ──────────────
  // Registered once at mount so they're active during the async Supabase
  // insert in start() — fixing the race where switching apps before the
  // insert returns meant blur/focus listeners weren't yet attached.
  //
  // Uses runningRef (set synchronously in start/stop) instead of the
  // `running` state (which updates asynchronously after render).
  //
  // Both visibilitychange (tab switching) and blur/focus (app switching)
  // are listened to. Guards on appHiddenRef prevent double-processing
  // when both fire for the same event.

  useEffect(() => {
    function onHide() {
      // Skip if timer not running or already hidden (dedup blur + visibilitychange).
      // Time keeps accumulating while hidden — no freeze, no commit.
      if (!runningRef.current || appHiddenRef.current) return
      appHiddenRef.current = true
    }

    function onShow() {
      // Skip if timer not running or not currently hidden (dedup focus + visibilitychange).
      if (!runningRef.current || !appHiddenRef.current) return
      appHiddenRef.current = false
      // Don't reset lastActivityRef here — idle detection runs continuously
      // so the idle prompt will already be showing if they were away long enough.
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
  }, []) // mount-only — all state is accessed via refs

  // ── Ticker ───────────────────────────────────────────────────────────────
  // Fires ~every second. Idle detection runs regardless of tab/window focus —
  // if the user walks away from any screen the idle prompt will fire after
  // IDLE_THRESHOLD_SEC. Date.now()-based math stays accurate even when
  // background tabs throttle the interval.

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const now = Date.now()

      if (idlePromptRef.current) {
        setPendingIdleSec(calcPendingIdleSec())
        return
      }

      const sinceActivity = now - lastActivityRef.current

      if (sinceActivity >= IDLE_THRESHOLD_SEC * 1000) {
        commitActiveAt(lastActivityRef.current)
        if (!idlePromptStartRef.current) {
          idlePromptStartRef.current = lastActivityRef.current + IDLE_THRESHOLD_SEC * 1000
        }
        setActiveSec(activeAccumRef.current)
        setPendingIdleSec(calcPendingIdleSec())
        idlePromptRef.current = true
        setIdlePrompt(true)
      } else {
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

    setStartError(null)

    // Mark as running synchronously BEFORE the network call so the always-on
    // visibility listeners handle any tab/app switches during the insert.
    runningRef.current = true
    appHiddenRef.current = document.hidden

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
    // Always start the active stretch immediately — time runs whether hidden or not.
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
    // Mark stopped synchronously so visibility listeners ignore future events.
    runningRef.current = false
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
      qc.invalidateQueries({ queryKey: ['work_sessions'] })
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
        startError,
        start,
        stop,
        explainIdle,
        dismissIdle,
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
