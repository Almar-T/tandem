import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { env } from '@/lib/env'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CalendarConnection {
  id: string
  user_id: string
  account_email: string
  access_token: string
  token_expiry: string
}

export interface GCalEvent {
  id: string
  calendar_id: string
  calendar_name: string
  calendar_color: string
  title: string
  start: string   // ISO datetime or YYYY-MM-DD (all-day)
  end: string
  all_day: boolean
  location: string | null
  html_link: string
}

// ── OAuth PKCE helpers ────────────────────────────────────────────────────────

async function generatePKCE() {
  const buf = crypto.getRandomValues(new Uint8Array(32))
  const b64 = btoa(Array.from(buf, (b) => String.fromCharCode(b)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  const verifier = b64

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const challenge = btoa(Array.from(new Uint8Array(digest), (b) => String.fromCharCode(b)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  return { verifier, challenge }
}

function getRedirectUri(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}gcal-callback.html`
}

// ── Connect flow ──────────────────────────────────────────────────────────────

export async function connectGoogleCalendar(): Promise<void> {
  if (!env.googleClientId) throw new Error('VITE_GOOGLE_CLIENT_ID is not set')

  const { verifier, challenge } = await generatePKCE()
  const state = crypto.randomUUID()
  sessionStorage.setItem('gcal_pkce', JSON.stringify({ verifier, state }))

  const params = new URLSearchParams({
    client_id:             env.googleClientId,
    redirect_uri:          getRedirectUri(),
    response_type:         'code',
    scope:                 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email',
    access_type:           'offline',
    prompt:                'consent',
    code_challenge:        challenge,
    code_challenge_method: 'S256',
    state,
  })

  const popup = window.open(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    'gcal_auth',
    'width=520,height=660,left=200,top=80',
  )
  if (!popup) throw new Error('Popup blocked — please allow popups for this site.')

  return new Promise((resolve, reject) => {
    const poll = setInterval(() => {
      if (popup.closed) {
        clearInterval(poll)
        window.removeEventListener('message', onMsg)
        reject(new Error('Popup closed'))
      }
    }, 500)

    async function onMsg(e: MessageEvent) {
      if (e.origin !== window.location.origin) return
      if ((e.data as { type?: string })?.type !== 'gcal_oauth') return
      clearInterval(poll)
      window.removeEventListener('message', onMsg)

      const { code, state: returnedState, error } = e.data as {
        code?: string; state?: string; error?: string
      }
      if (error) { reject(new Error(error)); return }

      const stored = sessionStorage.getItem('gcal_pkce')
      sessionStorage.removeItem('gcal_pkce')
      if (!stored) { reject(new Error('PKCE state lost')); return }
      const { verifier: v, state: savedState } = JSON.parse(stored) as {
        verifier: string; state: string
      }
      if (returnedState !== savedState) { reject(new Error('State mismatch')); return }

      const { error: fnErr } = await supabase.functions.invoke('gcal', {
        body: { action: 'exchange', code, code_verifier: v, redirect_uri: getRedirectUri() },
      })
      if (fnErr) reject(fnErr)
      else resolve()
    }

    window.addEventListener('message', onMsg)
  })
}

// ── Connections hook ──────────────────────────────────────────────────────────

export function useGcalConnections() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['calendar_connections'],
    enabled: !!user,
    queryFn: async (): Promise<CalendarConnection[]> => {
      const { data, error } = await supabase
        .from('calendar_connections')
        .select('id, user_id, account_email, access_token, token_expiry')
        .order('created_at')
      if (error) throw error
      return (data ?? []) as CalendarConnection[]
    },
  })
}

// ── Token refresh ─────────────────────────────────────────────────────────────

async function ensureFreshToken(conn: CalendarConnection): Promise<string> {
  const expiry = new Date(conn.token_expiry).getTime()
  if (Date.now() < expiry - 5 * 60 * 1000) return conn.access_token

  const { data, error } = await supabase.functions.invoke('gcal', {
    body: { action: 'refresh', connection_id: conn.id },
  })
  if (error) throw error
  return (data as { access_token: string }).access_token
}

// ── Google Calendar API helpers ───────────────────────────────────────────────

async function gFetch(path: string, token: string): Promise<unknown> {
  const res = await fetch(`https://www.googleapis.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Google API ${res.status}`)
  return res.json()
}

interface GCalListItem { id: string; summary: string; backgroundColor: string; selected?: boolean }
interface GCalAPIEvent {
  id: string
  summary?: string
  start: { dateTime?: string; date?: string }
  end:   { dateTime?: string; date?: string }
  location?: string
  htmlLink: string
}

async function fetchAllEvents(
  token: string,
  timeMin: string,
  timeMax: string,
): Promise<GCalEvent[]> {
  const listData = await gFetch('/calendar/v3/users/me/calendarList?minAccessRole=reader', token)
  const calendars = ((listData as { items?: GCalListItem[] }).items ?? []).filter(
    (c) => c.selected !== false,
  )

  const all: GCalEvent[] = []
  for (const cal of calendars) {
    try {
      const params = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: 'true',
        orderBy:      'startTime',
        maxResults:   '100',
      })
      const evData = await gFetch(
        `/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${params}`,
        token,
      )
      const items = ((evData as { items?: GCalAPIEvent[] }).items ?? [])
      for (const e of items) {
        const allDay = !!e.start.date
        all.push({
          id:             `${cal.id}::${e.id}`,
          calendar_id:    cal.id,
          calendar_name:  cal.summary,
          calendar_color: cal.backgroundColor ?? '#4285f4',
          title:          e.summary ?? '(No title)',
          start:          e.start.dateTime ?? e.start.date ?? '',
          end:            e.end.dateTime   ?? e.end.date   ?? '',
          all_day:        allDay,
          location:       e.location ?? null,
          html_link:      e.htmlLink,
        })
      }
    } catch {
      // skip individual calendar failures
    }
  }

  return all.sort((a, b) => a.start.localeCompare(b.start))
}

// ── Events hook ───────────────────────────────────────────────────────────────

export function useCalendarEvents(connections: CalendarConnection[]) {
  const { user } = useAuth()
  const connKey = connections.map((c) => c.id).join(',')

  return useQuery({
    queryKey:  ['calendar_events', user?.id ?? '', connKey],
    enabled:   connections.length > 0,
    staleTime: 15 * 60 * 1000,
    queryFn:   async (): Promise<GCalEvent[]> => {
      const now     = new Date()
      const timeMin = now.toISOString()
      const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
      const all: GCalEvent[] = []

      for (const conn of connections) {
        try {
          const token  = await ensureFreshToken(conn)
          const events = await fetchAllEvents(token, timeMin, timeMax)
          all.push(...events)
        } catch {
          // skip failed connections
        }
      }

      return all.sort((a, b) => a.start.localeCompare(b.start))
    },
  })
}
