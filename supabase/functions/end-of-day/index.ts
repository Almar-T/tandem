// Called by the HearthHall client when a user ends their day.
// Verifies the caller's JWT, builds a per-user recap, and sends a push
// notification to every subscribed device (both users).
//
// Deploy: supabase functions deploy end-of-day
// Secrets needed (same as notify): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT

// deno-lint-ignore-file no-explicit-any
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')  ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT')     ?? 'mailto:tandem@example.com'
const APP_URL = 'https://almar-t.github.io/tandem/'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

function fmtHours(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  if (h && m) return `${h}h ${m}m`
  return h ? `${h}h` : `${m}m`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    if (!jwt) return json({ error: 'unauthorized' }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Verify the calling user's JWT.
    const { data: { user }, error: authErr } = await admin.auth.getUser(jwt)
    if (authErr || !user) return json({ error: 'unauthorized' }, 401)

    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return json({ error: 'VAPID keys not configured — set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY secrets' }, 500)
    }
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

    // Pull today's data for all users.
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const since = todayStart.toISOString()

    const [
      { data: profiles = [] },
      { data: done    = [] },
      { data: sess    = [] },
    ] = await Promise.all([
      admin.from('profiles').select('id, display_name'),
      admin.from('tasks')
        .select('assignee_id, title')
        .eq('status', 'completed')
        .gte('completed_at', since),
      admin.from('work_sessions')
        .select('user_id, active_sec, idle_explained_sec')
        .gte('started_at', since)
        .not('ended_at', 'is', null),
    ])

    // Aggregate per user.
    const taskCount: Record<string, number>   = {}
    const topTask:   Record<string, string>   = {}
    const timeSec:   Record<string, number>   = {}

    for (const t of done as any[]) {
      taskCount[t.assignee_id] = (taskCount[t.assignee_id] ?? 0) + 1
      if (!topTask[t.assignee_id]) topTask[t.assignee_id] = t.title
    }
    for (const s of sess as any[]) {
      timeSec[s.user_id] = (timeSec[s.user_id] ?? 0) + s.active_sec + s.idle_explained_sec
    }

    const callerName = (profiles as any[]).find((p: any) => p.id === user.id)?.display_name
      ?? 'Your partner'

    // One summary line per person.
    const lines = (profiles as any[]).map((p: any) => {
      const n = taskCount[p.id] ?? 0
      const t = fmtHours(timeSec[p.id] ?? 0)
      const task = topTask[p.id] ? ` · "${topTask[p.id]}"` : ''
      return `${p.display_name}: ${n} task${n !== 1 ? 's' : ''}, ${t}${task}`
    })

    const title   = `🌙 ${callerName} wrapped up`
    const body    = lines.join('\n')
    const payload = JSON.stringify({ title, body, url: APP_URL })

    // Send to every subscribed device (both users).
    const { data: subs = [] } = await admin.from('push_subscriptions').select('id, subscription')
    let sent = 0

    await Promise.all(
      (subs as any[]).map(async (row) => {
        try {
          await webpush.sendNotification(row.subscription, payload)
          sent++
        } catch (e: any) {
          // Remove stale/expired subscriptions automatically.
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            await admin.from('push_subscriptions').delete().eq('id', row.id)
          }
        }
      }),
    )

    return json({ ok: true, sent, title, body })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
