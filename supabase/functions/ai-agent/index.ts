// Tandem AI agent — Supabase Edge Function (Deno).
//
// Holds the Gemini API key server-side and runs a tool-calling loop so the
// assistant can create/update/complete tasks on the user's behalf. All DB
// writes go through a Supabase client carrying the CALLER's JWT, so Row Level
// Security applies exactly as if the user did it themselves.
//
// Deploy:  supabase functions deploy ai-agent
// Secret:  supabase secrets set GEMINI_API_KEY=...   (optionally GEMINI_MODEL)

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// gemini-2.0-flash was retired from the free tier (0 quota); 3.1-flash-lite has
// generous free limits (15 RPM / 500 RPD) and supports tool calling.
const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.1-flash-lite'
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''

const WORK_TYPES = ['deep_work', 'admin', 'meeting', 'creative', 'study', 'collab']
const PRIORITIES = ['low', 'medium', 'high', 'urgent']
const STATUSES = ['not_started', 'in_progress', 'completed']

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    if (!GEMINI_KEY) {
      return json({ reply: 'The Gemini API key is not configured yet. Set it with `supabase secrets set GEMINI_API_KEY=...`', actions: [] })
    }

    const { messages } = (await req.json()) as { messages: { role: string; content: string }[] }

    // Caller-scoped client → RLS applies. Auth header is forwarded by supabase-js.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
    )

    const { data: auth } = await supabase.auth.getUser()
    const me = auth.user
    if (!me) return json({ reply: 'You need to be signed in.', actions: [] }, 401)

    const { data: profiles = [] } = await supabase.from('profiles').select('id, display_name')
    const myProfile = profiles.find((p) => p.id === me.id)
    const partner = profiles.find((p) => p.id !== me.id)
    const names = profiles.map((p) => p.display_name)

    // Compact context: open tasks so the AI can reference/update them by id.
    const { data: openTasks = [] } = await supabase
      .from('tasks')
      .select('id, title, status, due_date, priority, assignee_id')
      .neq('status', 'completed')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(50)

    const taskLines = openTasks
      .map((t) => {
        const who = profiles.find((p) => p.id === t.assignee_id)?.display_name ?? 'unassigned'
        return `- id=${t.id} | "${t.title}" | ${t.status} | due ${t.due_date ?? 'none'} | ${t.priority} | ${who}`
      })
      .join('\n')

    const now = new Date()
    const systemInstruction = {
      parts: [
        {
          text: [
            'You are the Tandem Planner — an AI productivity planner and project manager for a TWO-person shared workspace.',
            `The current user is "${myProfile?.display_name ?? 'the user'}" (id=${me.id}).`,
            partner ? `Their partner is "${partner.display_name}".` : '',
            `Current date/time (ISO): ${now.toISOString()}. Resolve relative dates ("tomorrow", "Friday") against this.`,
            '',
            '## How you work',
            '- Be a hands-on planner, not a note-taker. Help the user think, plan, and follow through.',
            '- You can create MULTIPLE tasks in one reply. When a request is big or vague ("launch my business", "prep for the investor meeting"), break it into concrete, well-scoped tasks and create them all.',
            '- A well-formed task has: title, category, work_type, priority, a time estimate, and (when relevant) a due date and assignee.',
            '- BEFORE creating a task, propose the full set of fields in ONE short message: fill in your best guess for each (category, work_type, priority, ~time estimate, assignee) and explicitly ASK for anything you cannot infer — especially the DUE DATE — and ask the user to confirm or tweak the rest. Lay it out clearly, e.g.:',
            '    "Here\'s what I\'ve got for the pitch deck — Category: Creative · Type: Deep work · Priority: High · Estimate: ~3h · Assignee: you · Due: ? — when is it due, and want me to create it with these?"',
            '- Only call create_task AFTER the user confirms (or if they explicitly say "just add it" / already gave every detail upfront). Then create it with the agreed values.',
            '- Always propose the time estimate yourself based on the kind of work — never make the user guess; they just confirm or adjust.',
            '- For BIG or vague requests, propose the task breakdown (the list of tasks with their fields) first and get a thumbs-up before creating them all.',
            '- Bundle all questions into ONE friendly message; never interrogate one question at a time.',
            '- Default the assignee to the current user unless told otherwise.',
            '- Offer light planning: suggest WHEN to do a task given its due date, size, and the open tasks below (batch similar work, protect mornings for deep work, tackle urgent/near-deadline first). Full auto-scheduling is coming; for now advise in words and set sensible due dates.',
            '- Be proactive: if there are overdue tasks or a crowded day, point it out and suggest what to focus on first.',
            '- Whenever you take an action, ALSO write a short, warm message (1–3 sentences) explaining what you did, your estimate, and any suggestion.',
            '',
            '## Conventions',
            '- due_date must be a full ISO 8601 timestamp.',
            '- show_on_calendar=true ONLY for time-specific events worth calendaring (meetings, calls, appointments, hard deadlines). Everyday to-dos stay off the calendar.',
            `- assignee must be one of: ${names.join(', ')} (or omit for the current user).`,
            '- To change or complete an existing task, use its exact id from the list below.',
            '- You cannot send push reminders yet (coming soon). If asked to remind, set a due date and say reminders will arrive once notifications are enabled.',
            '',
            'Current open tasks:',
            taskLines || '(none)',
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
    }

    const tools = [{ functionDeclarations: buildTools(names) }]

    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

    // Bounded tool-calling loop. The model can ask a question (text, no tools →
    // we return it), or call tools and then "see" the results to reply with real
    // guidance. Usually 1–2 Gemini calls per message; capped at 3.
    const actions: { type: string; detail: string }[] = []
    let reply = ''

    for (let i = 0; i < 3; i++) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ systemInstruction, contents, tools }),
        },
      )
      if (!res.ok) {
        const errText = await res.text()
        return json({ reply: `Gemini error: ${errText.slice(0, 300)}`, actions })
      }

      const data = await res.json()
      const candidate = data.candidates?.[0]
      const parts = candidate?.content?.parts ?? []
      const calls = parts.filter((p: Record<string, unknown>) => p.functionCall)
      const text = parts.map((p: { text?: string }) => p.text ?? '').join('').trim()
      if (text) reply = text

      if (calls.length === 0) break

      contents.push(candidate.content)
      const responseParts: unknown[] = []
      for (const call of calls) {
        const { name, args } = call.functionCall
        const result = await execTool(supabase, name, args, me.id, profiles)
        if (result.ok) actions.push({ type: name, detail: result.detail })
        responseParts.push({ functionResponse: { name, response: result } })
      }
      contents.push({ role: 'user', parts: responseParts })
    }

    if (!reply) reply = actions.length ? 'Done! ✓' : 'Hmm, I’m not sure how to help with that yet.'

    return json({ reply, actions })
  } catch (e) {
    return json({ reply: `Something went wrong: ${(e as Error).message}`, actions: [] }, 500)
  }
})

function buildTools(names: string[]) {
  const assignee = { type: 'STRING', enum: names, description: 'Who the task is for. Omit for the current user.' }
  return [
    {
      name: 'create_task',
      description: 'Create a new task in the shared list.',
      parameters: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          description: { type: 'STRING' },
          category: { type: 'STRING', description: 'e.g. Marketing, Admin, Personal' },
          work_type: { type: 'STRING', enum: WORK_TYPES },
          priority: { type: 'STRING', enum: PRIORITIES },
          due_date: { type: 'STRING', description: 'ISO 8601 timestamp' },
          estimate_min: { type: 'INTEGER', description: 'Estimated minutes to complete' },
          assignee,
          show_on_calendar: { type: 'BOOLEAN' },
        },
        required: ['title'],
      },
    },
    {
      name: 'update_task',
      description: 'Update fields of an existing task by id.',
      parameters: {
        type: 'OBJECT',
        properties: {
          task_id: { type: 'STRING' },
          title: { type: 'STRING' },
          priority: { type: 'STRING', enum: PRIORITIES },
          status: { type: 'STRING', enum: STATUSES },
          due_date: { type: 'STRING', description: 'ISO 8601 timestamp' },
          estimate_min: { type: 'INTEGER' },
          assignee,
          show_on_calendar: { type: 'BOOLEAN' },
        },
        required: ['task_id'],
      },
    },
    {
      name: 'complete_task',
      description: 'Mark a task complete by id.',
      parameters: {
        type: 'OBJECT',
        properties: { task_id: { type: 'STRING' } },
        required: ['task_id'],
      },
    },
  ]
}

type Profile = { id: string; display_name: string }

async function execTool(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  name: string,
  args: Record<string, unknown>,
  myId: string,
  profiles: Profile[],
): Promise<{ ok: boolean; detail: string; error?: string }> {
  const resolveAssignee = (a: unknown): string =>
    (typeof a === 'string' && profiles.find((p) => p.display_name === a)?.id) || myId

  try {
    if (name === 'create_task') {
      const row = {
        title: args.title,
        description: args.description ?? null,
        category: args.category ?? null,
        work_type: args.work_type ?? null,
        priority: args.priority ?? 'medium',
        due_date: args.due_date ?? null,
        estimate_min: args.estimate_min ?? null,
        show_on_calendar: args.show_on_calendar ?? false,
        assignee_id: resolveAssignee(args.assignee),
        created_by: myId,
      }
      const { error } = await supabase.from('tasks').insert(row)
      if (error) throw error
      return { ok: true, detail: `Created task "${args.title}"` }
    }

    if (name === 'update_task') {
      const patch: Record<string, unknown> = {}
      for (const k of ['title', 'priority', 'status', 'due_date', 'estimate_min', 'show_on_calendar']) {
        if (args[k] !== undefined) patch[k] = args[k]
      }
      if (args.assignee !== undefined) patch.assignee_id = resolveAssignee(args.assignee)
      const { error } = await supabase.from('tasks').update(patch).eq('id', args.task_id)
      if (error) throw error
      return { ok: true, detail: 'Updated task' }
    }

    if (name === 'complete_task') {
      const { error } = await supabase
        .from('tasks')
        .update({ status: 'completed' })
        .eq('id', args.task_id)
      if (error) throw error
      return { ok: true, detail: 'Marked task complete' }
    }

    return { ok: false, detail: '', error: `Unknown tool ${name}` }
  } catch (e) {
    return { ok: false, detail: '', error: (e as Error).message }
  }
}
