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

const log = (...args: unknown[]) => console.log('[timer]', ...args)

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

  const sessionIdRef       = useRef<string | null>(null)
  const appHiddenRef       = useRef(false)
  const runningRef         = useRef(false)
  const pausedRef          = useRef(false)

  const activeAccumRef       = useRef(0)
  const activeStartRef       = useRef<number | null>(null)
  const unexplainedAccumRef  = useRef(0)

  const lastTauriSignalRef   = useRef(0)
  const activeAccumAtHideRef = useRef(0)

  const awyStartRef          = useRef<number | null>(null)
  const awayNoticeTimer      = useRef<ReturnType<typeof setTimeout> | null>(null)

  const paused = idleNotice !== null
  const { recordActivity } = useIdleTracker(running && !paused, lastTauriSignalRef)

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
      const added = Math.floor((atMs - activeStartRef.current) / 1000)
      log(`commitActiveAt: +${added}s → accum now ${activeAccumRef.current + added}s`)
      activeAccumRef.current += added
      activeStartRef.current = null
    }
  }

  function dismissAwayNotice() {
    if (awayNoticeTimer.current) clearTimeout(awayNoticeTimer.current)
    setAwayNotice(null)
  }

  function showAwayNotice(msg: string) {
    log(`awayNotice: "${msg}"`)
    if (awayNoticeTimer.current) clearTimeout(awayNoticeTimer.current)
    setAwayNotice(msg)
    awayNoticeTimer.current = setTimeout(() => setAwayNotice(null), 6000)
  }

  function onTauriActivity() {
    if (!runningRef.current) {
      log('tauri signal ignored — timer not running')
      return
    }
    const prev = lastTauriSignalRef.current
    lastTauriSignalRef.current = Date.now()
    log(`tauri signal received (prev was ${prev ? Math.round((Date.now() - prev) / 1000) + 's ago' : 'never'})`)
    recordActivity('tauri')
    if (appHiddenRef.current && !pausedRef.current && activeStartRef.current === null) {
      log('tauri signal → resuming frozen timer (user active in another app)')
      activeStartRef.current = Date.now()
    } else {
      log(`tauri signal → no resume needed (appHidden=${appHiddenRef.current} paused=${pausedRef.current} activeStart=${activeStartRef.current !== null})`)
    }
  }

  // ── Idle event listener ───────────────────────────────────────────────────

  useEffect(() => {
    if (!running) return

    function onIdleDetected(e: Event) {
      const { rewindSec } = (e as CustomEvent<IdleDetectedDetail>).detail
      log(`IDLE EVENT received, rewindSec=${rewindSec}, current accum=${activeAccumRef.current}s`)
      commitActiveAt(Date.now())
      const rewound = Math.min(activeAccumRef.current, rewindSec)
      activeAccumRef.current -= rewound
      unexplainedAccumRef.current += rewound
      activeStartRef.current = null
      pausedRef.current = true
      setActiveSec(activeAccumRef.current)
      const mins = Math.round(rewound / 60)
      log(`idle: rewound ${rewound}s (${mins}min), accum now ${activeAccumRef.current}s`)
      setIdleNotice(
        mins > 0
          ? `Timer paused — ${mins} min removed for inactivity`
          : 'Timer paused due to inactivity',
      )
    }

    window.addEventListener(IDLE_DETECTED_EVENT, onIdleDetected)
    return () => window.removeEventListener(IDLE_DETECTED_EVENT, onIdleDetected)
  }, [running])

  // ── Tauri Realtime feed ───────────────────────────────────────────────────

  useEffect(() => {
    if (!running || !user) return
    log(`subscribing to tauri-heartbeat channel (user=${user.id})`)
    const channel = supabase
      .channel('tauri-heartbeat')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'desktop_activity', filter: `user_id=eq.${user.id}` },
        (payload) => {
          log('tauri-heartbeat Realtime INSERT received', payload)
          onTauriActivity()
        },
      )
      .subscribe((status) => {
        log(`tauri-heartbeat channel status: ${status}`)
      })
    return () => {
      log('unsubscribing tauri-heartbeat channel')
      supabase.removeChannel(channel)
    }
  }, [running, user])

  // ── Visibility / focus ────────────────────────────────────────────────────

  useEffect(() => {
    function onHide() {
      log(`onHide called — runningRef=${runningRef.current} appHiddenRef=${appHiddenRef.current}`)
      if (!runningRef.current || appHiddenRef.current) return
      appHiddenRef.current = true
      // Do NOT freeze the timer here — let it keep running.
      // The ticker's Tauri-silence check will freeze it if Tauri goes quiet.
      // Snapshot calcActiveSec() (not just accum) so onShow can measure gained time.
      activeAccumAtHideRef.current = calcActiveSec()
      awyStartRef.current = Date.now()
      log(`onHide: timer continues, snapshot=${activeAccumAtHideRef.current}s, document.hidden=${document.hidden} hasFocus=${document.hasFocus()}`)
    }

    function onShow() {
      log(`onShow called — runningRef=${runningRef.current} appHiddenRef=${appHiddenRef.current}`)
      if (!runningRef.current || !appHiddenRef.current) return
      appHiddenRef.current = false

      commitActiveAt(Date.now())

      if (awyStartRef.current !== null) {
        const awaySec = Math.floor((Date.now() - awyStartRef.current) / 1000)
        awyStartRef.current = null
        // Only reset the idle clock for meaningful absences (≥ 5 s). Brief
        // focus losses from macOS notifications or system dialogs (< 5 s) must
        // not silently restart the idle countdown.
        if (awaySec >= 5) recordActivity('onShow')
        const tauriGainedSec = activeAccumRef.current - activeAccumAtHideRef.current
        log(`onShow: awaySec=${awaySec} tauriGainedSec=${tauriGainedSec} accum=${activeAccumRef.current}s`)
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
        log(`onShow: timer resumed, accum=${activeAccumRef.current}s`)
      }
      setActiveSec(calcActiveSec())
    }

    function onVisibilityChange() {
      log(`visibilitychange: document.hidden=${document.hidden} hasFocus=${document.hasFocus()}`)
      if (document.hidden) onHide()
      else onShow()
    }

    function onBlur() {
      log(`window blur — document.hidden=${document.hidden} hasFocus=${document.hasFocus()}`)
      onHide()
    }

    function onFocus() {
      log(`window focus — document.hidden=${document.hidden} hasFocus=${document.hasFocus()}`)
      onShow()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  // ── Ticker ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      if (document.hidden) return
      if (pausedRef.current) return

      if (appHiddenRef.current) {
        // User is in another app. Keep counting unless Tauri has gone quiet,
        // which means the user is genuinely idle (Tauri stops flushing after
        // SYSTEM_IDLE_CUTOFF_SEC=60s of no keyboard/mouse anywhere on the system).
        if (activeStartRef.current !== null) {
          const tauriSilentMs = Date.now() - lastTauriSignalRef.current
          if (lastTauriSignalRef.current > 0 && tauriSilentMs >= IDLE_THRESHOLD_SEC * 1000) {
            log(`ticker: Tauri silent ${Math.round(tauriSilentMs / 1000)}s — freezing at last signal`)
            commitActiveAt(lastTauriSignalRef.current)
          } else {
            setActiveSec(calcActiveSec())
          }
        }
        return
      }

      if (activeStartRef.current === null) {
        log('ticker: activeStartRef was null while in-tab — starting stretch now')
        activeStartRef.current = Date.now()
      }
      setActiveSec(calcActiveSec())
    }, 1000)
    return () => clearInterval(id)
  }, [running])

  // ── Public actions ────────────────────────────────────────────────────────

  async function start(next?: Task | null) {
    log(`start() called — task=${next?.title ?? 'none'} document.hidden=${document.hidden} hasFocus=${document.hasFocus()}`)
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
    activeAccumAtHideRef.current = 0

    log(`start: running appHidden=${appHiddenRef.current} activeStart=${activeStartRef.current !== null}`)
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
    log(`stop() called — accum=${activeAccumRef.current}s unexplained=${unexplainedAccumRef.current}s`)
    runningRef.current = false
    pausedRef.current = false
    setRunning(false)
    setIdleNotice(null)
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
    log('resumeFromIdle called')
    recordActivity('resumeFromIdle')
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
