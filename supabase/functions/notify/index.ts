// Tandem push sender — Supabase Edge Function (Deno).
//
// Invoked by pg_cron (with the service-role key as bearer) for scheduled jobs:
//   { "mode": "checkin" } | { "mode": "overdue" } | { "mode": "eod" }
// Sends Web Push to both users' subscriptions using the VAPID keys.
//
// Deploy:  supabase functions deploy notify
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@…)

// deno-lint-ignore-file no-explicit-any
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:tandem@example.com'
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

const hours = (sec: number) => Math.round((sec / 3600) * 10) / 10

Deno.serve(async (req) => {
  try {
    // Gate the endpoint with a shared secret (set CRON_SECRET; cron/curl send it
    // as the x-cron-secret header). Avoids JWT/key-format issues with the gateway.
    const cronSecret = Deno.env.get('CRON_SECRET') ?? ''
    if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
      return json({ error: 'unauthorized' }, 401)
    }
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return json({ error: 'VAPID keys not configured' }, 500)
    }
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

    const { mode } = await req.json().catch(() => ({ mode: 'checkin' }))
    const { data: profiles = [] } = await supabase.from('profiles').select('id, display_name')
    const nameOf = (id: string) => profiles.find((p: any) => p.id === id)?.display_name ?? '?'

    let title = 'Tandem'
    let body = ''

    if (mode === 'checkin') {
      title = 'Good morning ☀️'
      body = 'Open Tandem to plan your day.'
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
      body = profiles.map((p: any) => `${p.display_name}: ${counts[p.id] ?? 0}`).join('  ·  ')
    } else if (mode === 'eod') {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const { data: done = [] } = await supabase
        .from('tasks')
        .select('assignee_id')
        .eq('status', 'completed')
        .gte('completed_at', start.toISOString())
      const { data: sess = [] } = await supabase
        .from('work_sessions')
        .select('user_id, active_sec')
        .gte('started_at', start.toISOString())
      const dc: Record<string, number> = {}
      const tm: Record<string, number> = {}
      for (const t of done as any[]) dc[t.assignee_id] = (dc[t.assignee_id] ?? 0) + 1
      for (const s of sess as any[]) tm[s.user_id] = (tm[s.user_id] ?? 0) + s.active_sec
      title = '🌙 Day recap'
      body = profiles
        .map((p: any) => `${p.display_name}: ${dc[p.id] ?? 0} done, ${hours(tm[p.id] ?? 0)}h`)
        .join('  ·  ')
    }

    // Send to every subscription of both users (shared accountability).
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
