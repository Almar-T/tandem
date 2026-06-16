// HearthHall push sender — Supabase Edge Function (Deno).
//
// Modes (sent in JSON body):
//   { "mode": "checkin"  } — morning check-in (open app to plan)
//   { "mode": "overdue"  } — alert about overdue tasks
//   { "mode": "eod"      } — end-of-day recap (today's data, called by End Day button via notify or cron)
//   { "mode": "morning"  } — yesterday's accomplishments at 8 AM
//
// Auth: x-cron-secret header must match CRON_SECRET env secret.
// Deploy: supabase functions deploy notify

// deno-lint-ignore-file no-explicit-any
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')  ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT')     ?? 'mailto:tandem@example.com'
const APP_URL = 'https://almar-t.github.io/tandem/'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function fmtH(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  if (h && m) return `${h}h ${m}m`
  return h ? `${h}h` : `${m}m`
}

Deno.serve(async (req) => {
  try {
    const cronSecret = Deno.env.get('CRON_SECRET') ?? ''
    if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
      return json({ error: 'unauthorized' }, 401)
    }
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return json({ error: 'VAPID keys not configured' }, 500)
    }
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

    const { mode } = await req.json().catch(() => ({ mode: 'checkin' }))
    const { data: profiles = [] } = await supabase.from('profiles').select('id, display_name')

    let title = 'HearthHall'
    let body  = ''

    // ── Morning check-in ──────────────────────────────────────────
    if (mode === 'checkin') {
      title = '☀️ Good morning!'
      body  = 'Open HearthHall to plan your day.'

    // ── Overdue alert ─────────────────────────────────────────────
    } else if (mode === 'overdue') {
      const { data: overdue = [] } = await supabase
        .from('tasks')
        .select('assignee_id')
        .neq('status', 'completed')
        .lt('due_date', new Date().toISOString())
      if (overdue.length === 0) return json({ ok: true, msg: 'no overdue' })
      const counts: Record<string, number> = {}
      for (const t of overdue as any[]) counts[t.assignee_id] = (counts[t.assignee_id] ?? 0) + 1
      title = '⚠️ Overdue tasks'
      body  = (profiles as any[])
        .map((p: any) => `${p.display_name}: ${counts[p.id] ?? 0}`)
        .join('  ·  ')

    // ── End-of-day recap (today's data) ───────────────────────────
    } else if (mode === 'eod') {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const since = start.toISOString()
      const { data: done = [] } = await supabase
        .from('tasks')
        .select('assignee_id, title')
        .eq('status', 'completed')
        .gte('completed_at', since)
      const { data: sess = [] } = await supabase
        .from('work_sessions')
        .select('user_id, active_sec, idle_explained_sec')
        .gte('started_at', since)
        .not('ended_at', 'is', null)
      const dc: Record<string, number> = {}
      const topTask: Record<string, string> = {}
      const tm: Record<string, number> = {}
      for (const t of done as any[]) {
        dc[t.assignee_id] = (dc[t.assignee_id] ?? 0) + 1
        if (!topTask[t.assignee_id]) topTask[t.assignee_id] = t.title
      }
      for (const s of sess as any[]) {
        tm[s.user_id] = (tm[s.user_id] ?? 0) + s.active_sec + s.idle_explained_sec
      }
      title = '🌙 Day recap'
      body  = (profiles as any[])
        .map((p: any) => {
          const n = dc[p.id] ?? 0
          const task = topTask[p.id] ? ` · "${topTask[p.id]}"` : ''
          return `${p.display_name}: ${n} task${n !== 1 ? 's' : ''}, ${fmtH(tm[p.id] ?? 0)}${task}`
        })
        .join('\n')

    // ── Morning recap (yesterday's data, fires at 8 AM Central) ──
    } else if (mode === 'morning') {
      // "Yesterday" in UTC — safe because we fire at 13:00 UTC (8 AM CDT)
      const yd = new Date()
      yd.setUTCDate(yd.getUTCDate() - 1)
      yd.setUTCHours(0, 0, 0, 0)
      const ydEnd = new Date(yd)
      ydEnd.setUTCHours(23, 59, 59, 999)

      const { data: done = [] } = await supabase
        .from('tasks')
        .select('assignee_id, title')
        .eq('status', 'completed')
        .gte('completed_at', yd.toISOString())
        .lte('completed_at', ydEnd.toISOString())
      const { data: sess = [] } = await supabase
        .from('work_sessions')
        .select('user_id, active_sec, idle_explained_sec')
        .gte('started_at', yd.toISOString())
        .lte('started_at', ydEnd.toISOString())
        .not('ended_at', 'is', null)

      const dc: Record<string, number> = {}
      const topTask: Record<string, string> = {}
      const tm: Record<string, number> = {}
      for (const t of done as any[]) {
        dc[t.assignee_id] = (dc[t.assignee_id] ?? 0) + 1
        if (!topTask[t.assignee_id]) topTask[t.assignee_id] = t.title
      }
      for (const s of sess as any[]) {
        tm[s.user_id] = (tm[s.user_id] ?? 0) + s.active_sec + s.idle_explained_sec
      }

      const anyActivity = Object.values(tm).some((t) => t > 0) || Object.values(dc).some((n) => n > 0)
      if (!anyActivity) return json({ ok: true, msg: 'no activity yesterday, skipped' })

      const lines = (profiles as any[]).map((p: any) => {
        const n = dc[p.id] ?? 0
        const task = topTask[p.id] ? ` · "${topTask[p.id]}"` : ''
        return `${p.display_name}: ${n} task${n !== 1 ? 's' : ''}, ${fmtH(tm[p.id] ?? 0)}${task}`
      })
      title = "☀️ Good morning — yesterday's recap"
      body  = lines.join('\n')
    }

    // Send to every subscribed device of both users.
    const { data: subs = [] } = await supabase.from('push_subscriptions').select('id, subscription')
    const payload = JSON.stringify({ title, body, url: APP_URL })
    let sent = 0

    await Promise.all(
      (subs as any[]).map(async (row) => {
        try {
          await webpush.sendNotification(row.subscription, payload)
          sent++
        } catch (e: any) {
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', row.id)
          }
        }
      }),
    )

    return json({ ok: true, mode, sent, body })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
