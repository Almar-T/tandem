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

// After this much input-free time we pause tracking and ask what's up.
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

  const [task, setTask] = useState<Task | null>(null)
  const [running, setRunning] = useState(false)
  const [activeSec, setActiveSec] = useState(0)
  const [explainedSec, setExplainedSec] = useState(0)
  const [unexplainedSec, setUnexplainedSec] = useState(0)
  const [pendingIdleSec, setPendingIdleSec] = useState(0)
  const [idlePrompt, setIdlePrompt] = useState(false)

  // Refs mirror state so the activity listener / interval / stop() read fresh values.
  const sessionIdRef = useRef<string | null>(null)
  const lastActivityRef = useRef<number>(Date.now())
  const idlePromptRef = useRef(false)
  const pendingRef = useRef(0)
  const activeRef = useRef(0)
  const explainedRef = useRef(0)
  const unexplainedRef = useRef(0)
  const reasonRef = useRef<IdleReason | null>(null)

  useEffect(() => void (idlePromptRef.current = idlePrompt), [idlePrompt])
  useEffect(() => void (pendingRef.current = pendingIdleSec), [pendingIdleSec])
  useEffect(() => void (activeRef.current = activeSec), [activeSec])
  useEffect(() => void (explainedRef.current = explainedSec), [explainedSec])
  useEffect(() => void (unexplainedRef.current = unexplainedSec), [unexplainedSec])

  // Track user input. Resuming activity during an idle prompt marks that gap unexplained.
  useEffect(() => {
    function onActivity() {
      lastActivityRef.current = Date.now()
      if (idlePromptRef.current) {
        setUnexplainedSec((s) => s + pendingRef.current)
        setPendingIdleSec(0)
        setIdlePrompt(false)
      }
    }
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart']
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    return () => events.forEach((e) => window.removeEventListener(e, onActivity))
  }, [])

  // One tick per second while running.
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const since = Date.now() - lastActivityRef.current
      if (idlePromptRef.current) {
        setPendingIdleSec((s) => s + 1)
      } else if (since >= IDLE_THRESHOLD_SEC * 1000) {
        setIdlePrompt(true)
        setPendingIdleSec(0)
      } else {
        setActiveSec((s) => s + 1)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [running])

  // task is optional — a one-click "general work" session has no task attached.
  async function start(next?: Task | null) {
    if (sessionIdRef.current) await stop()
    const { data } = await supabase
      .from('work_sessions')
      .insert({ task_id: next?.id ?? null, user_id: user?.id })
      .select('id')
      .single()
    sessionIdRef.current = data?.id ?? null
    setTask(next ?? null)
    setActiveSec(0)
    setExplainedSec(0)
    setUnexplainedSec(0)
    setPendingIdleSec(0)
    reasonRef.current = null
    lastActivityRef.current = Date.now()
    setIdlePrompt(false)
    setRunning(true)
    // Nudge the task into "in progress" if it hadn't started.
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
    setRunning(false)
    setIdlePrompt(false)
    const id = sessionIdRef.current
    sessionIdRef.current = null
    if (id) {
      const unexplained = unexplainedRef.current + (idlePromptRef.current ? pendingRef.current : 0)
      await supabase
        .from('work_sessions')
        .update({
          ended_at: new Date().toISOString(),
          active_sec: activeRef.current,
          idle_explained_sec: explainedRef.current,
          idle_unexplained_sec: unexplained,
          idle_reason: reasonRef.current,
        })
        .eq('id', id)
      qc.invalidateQueries({ queryKey: ['tasks'] }) // actual_min updated by the rollup trigger
    }
    setTask(null)
  }

  function explainIdle(reason: IdleReason) {
    setExplainedSec((s) => s + pendingRef.current)
    reasonRef.current = reason
    setPendingIdleSec(0)
    setIdlePrompt(false)
    lastActivityRef.current = Date.now()
  }

  function dismissIdle() {
    setUnexplainedSec((s) => s + pendingRef.current)
    setPendingIdleSec(0)
    setIdlePrompt(false)
    lastActivityRef.current = Date.now()
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
