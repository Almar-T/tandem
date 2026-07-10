// Google Calendar OAuth Edge Function
//
// Handles two actions:
//   exchange  — swap OAuth code + PKCE verifier for tokens, store in DB
//   refresh   — use stored refresh_token to get a new access_token, update DB
//
// Deploy: npx supabase@latest functions deploy gcal
// Secrets needed:
//   npx supabase@latest secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=...

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')              ?? ''
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const GOOGLE_CLIENT_ID  = Deno.env.get('GOOGLE_CLIENT_ID')          ?? ''
const GOOGLE_SECRET     = Deno.env.get('GOOGLE_CLIENT_SECRET')      ?? ''

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

function err(msg: string, status = 400) {
  return json({ error: msg }, status)
}

// Returns the calling user's id from their JWT.
async function getUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization')
  if (!auth) return null
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const { data } = await sb.auth.getUser(auth.replace('Bearer ', ''))
  return data.user?.id ?? null
}

async function exchangeCode(
  userId: string,
  code: string,
  codeVerifier: string,
  redirectUri: string,
) {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_SECRET,
      code,
      code_verifier: codeVerifier,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
    }),
  })
  const tokens = await tokenRes.json()
  if (!tokenRes.ok) throw new Error(tokens.error_description ?? 'Token exchange failed')

  // Fetch the connected Google account email.
  const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const info = await infoRes.json()

  const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const { error } = await sb.from('calendar_connections').insert({
    user_id:       userId,
    account_email: info.email ?? 'unknown',
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expiry:  expiry,
  })
  if (error) throw new Error(error.message)

  return { ok: true }
}

async function refreshToken(userId: string, connectionId: string) {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Service role bypasses column-level privilege so we can read refresh_token.
  const { data: conn, error: selErr } = await sb
    .from('calendar_connections')
    .select('refresh_token, user_id')
    .eq('id', connectionId)
    .single()
  if (selErr || !conn) throw new Error('Connection not found')
  if (conn.user_id !== userId) throw new Error('Forbidden')

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_SECRET,
      refresh_token: conn.refresh_token,
      grant_type:    'refresh_token',
    }),
  })
  const tokens = await tokenRes.json()
  if (!tokenRes.ok) throw new Error(tokens.error_description ?? 'Refresh failed')

  const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await sb
    .from('calendar_connections')
    .update({ access_token: tokens.access_token, token_expiry: expiry })
    .eq('id', connectionId)

  return { access_token: tokens.access_token, token_expiry: expiry }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const userId = await getUserId(req)
    if (!userId) return err('Unauthorized', 401)

    const body = await req.json() as Record<string, any>
    const action = body.action as string

    if (action === 'exchange') {
      const result = await exchangeCode(
        userId,
        body.code,
        body.code_verifier,
        body.redirect_uri,
      )
      return json(result)
    }

    if (action === 'refresh') {
      const result = await refreshToken(userId, body.connection_id)
      return json(result)
    }

    return err('Unknown action')
  } catch (e: any) {
    console.error('[gcal]', e)
    return err(e.message ?? 'Internal error', 500)
  }
})
