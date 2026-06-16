import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401, headers: CORS })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
  const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.0-flash-lite'

  // Resolve the calling user
  const userClient = createClient(
    SUPABASE_URL,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return new Response('Unauthorized', { status: 401, headers: CORS })

  const serviceClient = createClient(
    SUPABASE_URL,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { domain, reason, action } = await req.json()

  let approved: boolean | null = null
  let aiMessage = ''

  if (action === 'explained' && reason?.trim()) {
    const prompt = `You are a strict but fair productivity judge for an app called Tandem.

The user has an active work timer running and has been on "${domain}" (a leisure/distraction site).
Their explanation for why they are there: "${reason}"

Rules:
- APPROVE if the reason is specific and plausible for work (e.g. "watching a tutorial on React hooks", "researching competitor", "replying to a work DM on Instagram")
- REJECT if the reason is vague (under 8 words), clearly personal, or not work-related
- REJECT things like: "just checking", "a bit of break", "relaxing", "watching something", anything without a concrete work purpose

Respond ONLY with valid JSON, no markdown fences:
{"approved":true,"message":"Great — noted, keep going."} or {"approved":false,"message":"One short sentence telling them why you rejected it and nudging them to explain better."}`

    const gRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 80 },
        }),
      },
    )
    const gData = await gRes.json()
    const raw = gData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    try {
      const parsed = JSON.parse(raw.trim())
      approved = parsed.approved ?? false
      aiMessage = parsed.message ?? ''
    } catch {
      approved = false
      aiMessage = 'Could not verify — please give a more specific reason.'
    }
  }

  // Log the event regardless of outcome
  await serviceClient.from('distraction_events').insert({
    user_id: user.id,
    domain,
    reason: reason ?? null,
    action,
    ai_approved: approved,
    ai_message: aiMessage || null,
  })

  return new Response(
    JSON.stringify({ approved, message: aiMessage }),
    { headers: { ...CORS, 'Content-Type': 'application/json' } },
  )
})
