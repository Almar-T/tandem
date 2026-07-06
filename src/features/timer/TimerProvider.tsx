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

const log = (...args: unknown[]) => console.log('[timer]', ...args)

interface TimerCtx {
  task: Task | null
  running: boolean
  activeSec: number
  idleNotice: string | null
  resumeNotice: string | null
  awayNotice: string | null
  startError: string | null
  tauriConnected: boolean
  start: (task?: Task | null) => void
  stop: () => void
  resumeFromIdle: () => void
  dismissAwayNotice: () => void
  dismissResumeNotice: () => void
}

const Ctx = createContext<TimerCtx | undefined>(undefined)

export function TimerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const qc = useQueryClient()

  const [task, setTask]             = useState<Task | null>(null)
  const [running, setRunning]       = useState(false)
  const [activeSec, setActiveSec]   = useState(0)
  const [idleNotice, setIdleNotice] = useState<string | null>(null)
  const [resumeNotice, setResumeNotice] = useState<string | null>(null)
  const [awayNotice, setAwayNotice] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)

  const sessionIdRef   = useRef<string | null>(null)
  const appHiddenRef   = useRef(false)
  const runningRef     = useRef(false)
  const pausedRef      = useRef(false)

  const activeAccumRef      = useRef(0)
  const activeStartRef      = useRef<number | null>(null)
  const unexplainedAccumRef = useRef(0)

  const lastTauriSignalRef  = useRef(0)
  const [tauriLastSeen, setTauriLastSeen] = useState(0)

  const awyStartRef     = useRef<number | null>(null)
  const awayNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function calcActiveSec(): number {
    return activeAccumRef.current + (
      activeStartRef.current !== null
        ? Math.floor((Date.now() - activeStartRef.current) / 1000)
        : 0
    )
  }

  function commitActiveAt(atMs: number) {
    if (activeStartRef.current !== null) {
      const added = Math.floor((atMs - activeStartRef.current) / 1000)
      log(`commitActiveAt: +${added}s → accum ${activeAccumRef.current + added}s`)
      activeAccumRef.current += added
      activeStartRef.current = null
    }
  }

  function dismissAwayNotice() {
    if (awayNoticeTimer.current) clearTimeout(awayNoticeTimer.current)
    setAwayNotice(null)
  }

  function dismissResumeNotice() {
    setResumeNotice(null)
  }

  // ── Tracker signal handlers ─────────────────────────────────────────────────
  //
  // The HearthHall tracker (Rust/Tauri) owns all idle detection. It monitors
  // system-wide keyboard/mouse activity every 15 s and sends explicit signals:
  //   _idle_   → user inactive for 120 s → pause timer, rewind 2 min
  //   _active_ → user returned → resume timer, show notification

  function onTrackerIdle() {
    if (!runningRef.current || pausedRef.current) return
    commitActiveAt(Date.now())
    const rewindSec = 120
    const rewound = Math.min(activeAccumRef.current, rewindSec)
    activeAccumRef.current -= rewound
    unexplainedAccumRef.current += rewound
    activeStartRef.current = null
    pausedRef.current = true
    setActiveSec(activeAccumRef.current)
    const mins = Math.round(rewound / 60)
    setResumeNotice(null)
    setIdleNotice(
      mins > 0
        ? `Timer paused — ${mins} min removed for inactivity`
        : 'Timer paused due to inactivity',
    )
    log(`IDLE signal: paused, rewound ${rewound}s (${mins}min)`)
  }

  function onTrackerActive() {
    if (!runningRef.current || !pausedRef.current) return
    log('ACTIVE signal: auto-resuming timer')
    pausedRef.current = false
    activeStartRef.current = Date.now()
    setIdleNotice(null)
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    setResumeNotice(`Activity detected — timer resumed at ${time}. Tap OK when you've seen this.`)
  }

  function onTrackerActivity() {
    if (!runningRef.current) return
    lastTauriSignalRef.current = Date.now()
    setTauriLastSeen(Date.now())
    // Resume frozen timer if user is active in another app.
    if (appHiddenRef.current && activeStartRef.current === null && !pausedRef.current) {
      activeStartRef.current = Date.now()
    }
  }

  // Keep refs current so Realtime/polling callbacks always use the latest closure.
  const onTrackerIdleRef   = useRef<() => void>(() => {})
  const onTrackerActiveRef = useRef<() => void>(() => {})
  const onTrackerActivityRef = useRef<() => void>(() => {})
  onTrackerIdleRef.current     = onTrackerIdle
  onTrackerActiveRef.current   = onTrackerActive
  onTrackerActivityRef.current = onTrackerActivity

  // ── Tauri Realtime feed ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!running || !user) return
    const uid = user.id
    log(`subscribing to tracker channel (user=${uid})`)

    const channel = supabase
      .channel(`tracker-${uid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'desktop_activity' },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          if (row.user_id !== uid) return

          // Any row means Realtime is working — suppress the polling fallback.
          lastTauriSignalRef.current = Date.now()
          setTauriLastSeen(Date.now())

          const appName = row.app_name as string | undefined
          if (appName === '_idle_') {
            log('Realtime: IDLE signal from tracker')
            onTrackerIdleRef.current()
          } else if (appName === '_active_') {
            log('Realtime: ACTIVE signal from tracker')
            onTrackerActiveRef.current()
          } else {
            log('Realtime: activity heartbeat from tracker')
            onTrackerActivityRef.current()
          }
        },
      )
      .subscribe((status) => log(`tracker channel status: ${status}`))

    // Polling fallback — activates only when Realtime has been silent for 30 s
    // (e.g. the desktop_activity table isn't in the Supabase Realtime publication).
    // Checks for the most recent row and routes it the same way Realtime would.
    const pollId = setInterval(async () => {
      const silent = lastTauriSignalRef.current
        ? Date.now() - lastTauriSignalRef.current
        : Infinity
      if (silent < 30_000) return

      const since = new Date(Date.now() - 20_000).toISOString()
      const { data } = await supabase
        .from('desktop_activity')
        .select('app_name')
        .eq('user_id', uid)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1)

      if (!data?.length) return
      lastTauriSignalRef.current = Date.now()
      const appName = data[0].app_name as string | undefined

      if (appName === '_idle_') {
        log('poll fallback: IDLE signal')
        onTrackerIdleRef.current()
      } else if (appName === '_active_') {
        log('poll fallback: ACTIVE signal')
        onTrackerActiveRef.current()
      } else {
        log('poll fallback: activity heartbeat')
        onTrackerActivityRef.current()
      }
    }, 15_000)

    return () => {
      log('unsubscribing tracker channel')
      supabase.removeChannel(channel)
      clearInterval(pollId)
    }
  }, [running, user])

  // ── Visibility / focus ───────────────────────────────────────────────────────

  useEffect(() => {
    function onHide() {
      if (!runningRef.current || appHiddenRef.current) return
      appHiddenRef.current = true
      awyStartRef.current = Date.now()
      log(`onHide: timer continues in background`)
    }

    function onShow() {
      if (!runningRef.current || !appHiddenRef.current) return
      appHiddenRef.current = false

      if (awyStartRef.current !== null) {
        awyStartRef.current = null
      }

      if (activeStartRef.current === null && !pausedRef.current) {
        activeStartRef.current = Date.now()
        log(`onShow: timer resumed, accum=${activeAccumRef.current}s`)
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

  // ── Ticker ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      if (document.hidden) return
      if (pausedRef.current) return

      if (appHiddenRef.current) {
        if (activeStartRef.current !== null) setActiveSec(calcActiveSec())
        return
      }

      if (activeStartRef.current === null) {
        activeStartRef.current = Date.now()
      }
      setActiveSec(calcActiveSec())
    }, 1000)
    return () => clearInterval(id)
  }, [running])

  // ── Public actions ───────────────────────────────────────────────────────────

  async function start(next?: Task | null) {
    log(`start() — task=${next?.title ?? 'none'}`)
    if (sessionIdRef.current) await stop()

    setStartError(null)
    setIdleNotice(null)
    setResumeNotice(null)
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
      log(`start: session created id=${sessionId}`)
    } catch (err) {
      console.error('[timer] start: failed to create session', err)
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
    log(`stop() — accum=${activeAccumRef.current}s unexplained=${unexplainedAccumRef.current}s`)
    runningRef.current = false
    pausedRef.current = false
    setRunning(false)
    setIdleNotice(null)
    setResumeNotice(null)
    dismissAwayNotice()

    const id = sessionIdRef.current
    sessionIdRef.current = null

    if (id) {
      commitActiveAt(Date.now())
      log(`stop: saving session id=${id} active_sec=${activeAccumRef.current}`)
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
    log('resumeFromIdle (manual)')
    pausedRef.current = false
    activeStartRef.current = Date.now()
    setIdleNotice(null)
    setResumeNotice(null)
  }

  return (
    <Ctx.Provider
      value={{
        task,
        running,
        activeSec,
        idleNotice,
        resumeNotice,
        awayNotice,
        startError,
        tauriConnected: tauriLastSeen > 0,
        start,
        stop,
        resumeFromIdle,
        dismissAwayNotice,
        dismissResumeNotice,
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
