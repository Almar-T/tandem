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
      .select('id, title, status, due_date, priority, assignee_id, estimate_min, work_type, scheduled_start')
      .neq('status', 'completed')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(50)

    const taskLines = openTasks
      .map((t) => {
        const who = profiles.find((p) => p.id === t.assignee_id)?.display_name ?? 'unassigned'
        const est = t.estimate_min ? `${t.estimate_min}m` : '?'
        const sched = t.scheduled_start ? `sched ${t.scheduled_start}` : 'unscheduled'
        return `- id=${t.id} | "${t.title}" | ${t.status} | ${t.work_type ?? 'task'} | est ${est} | due ${t.due_date ?? 'none'} | ${t.priority} | ${who} | ${sched}`
      })
      .join('\n')

    const { data: activeGoals = [] } = await supabase
      .from('goals')
      .select('id, title')
      .eq('status', 'active')
    const goalLines = activeGoals.map((g) => `- id=${g.id} | "${g.title}"`).join('\n')

    // Time tracked so far today (both users) — for check-in / log-off summaries.
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { data: todaySessions = [] } = await supabase
      .from('work_sessions')
      .select('user_id, active_sec')
      .gte('started_at', todayStart.toISOString())
    const timeByUser: Record<string, number> = {}
    for (const s of todaySessions) timeByUser[s.user_id] = (timeByUser[s.user_id] ?? 0) + s.active_sec
    const timeLines = profiles
      .map((p) => `- ${p.display_name}: ${Math.round((timeByUser[p.id] ?? 0) / 60)} min tracked today`)
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
            '## Formatting',
            '- Your responses are rendered as rich markdown. Use **bold**, *italic*, ### headings, and - bullet lists freely.',
            '- When a visual would genuinely help (task breakdown, timeline, progress chart, comparison), embed a mermaid diagram using a ```mermaid``` code block. Prefer pie, xychart-beta, or gantt depending on context. Keep diagrams concise.',
            '- Never show raw asterisks or hashes as plain text — always use proper markdown syntax.',
            '',
            '## Conventions',
            '- due_date must be a full ISO 8601 timestamp.',
            '- show_on_calendar=true ONLY for time-specific events worth calendaring (meetings, calls, appointments, hard deadlines). Everyday to-dos stay off the calendar.',
            `- assignee must be one of: ${names.join(', ')} (or omit for the current user).`,
            '- To change or complete an existing task, use its exact id from the list below.',
            '- You cannot send push reminders yet (coming soon). If asked to remind, set a due date and say reminders will arrive once notifications are enabled.',
            '',
            '## Goals — INTERVIEW FIRST, PLAN SECOND',
            '- When the user names a big objective ("launch my business", "get fit", "ship the app"), DO NOT propose or create any tasks yet. First INTERVIEW them to understand exactly what they want and how they are thinking about it.',
            '- Ask focused, open-ended questions — bundled a few at a time, over one or more rounds — to draw out: what success looks like to them, their deadline, what they have already done, scope and must-haves vs nice-to-haves, constraints (time, money, skills, tools), who is involved (them, their partner, others), and how they picture getting there. You MAY offer suggestions or options to help them think, but the aim is to extract THEIR vision, priorities, and plan — not to impose yours.',
            '- Keep interviewing until you genuinely understand the goal well enough to plan it well. Get as much relevant detail from them as you reasonably can before planning.',
            '- THEN summarise your understanding back to them, and only after that propose the goal + milestones + a concrete task breakdown for their approval.',
            '- Call create_goal (and create_task with the returned goal_id for each task) ONLY after they approve your proposed plan. Never create the goal or tasks during the interview phase.',
            '- Progress tracks automatically from completed linked tasks, so make tasks concrete and completable. You can also link a task to an existing goal by goal_id from the list below.',
            '',
            '## Day planning',
            '- When asked to plan a day ("plan my day"), first ask which day, what hours they are available, and any fixed commitments — unless they already told you.',
            '- Then build an efficient schedule using evidence-based principles: protect a long uninterrupted block for deep_work in their high-energy window (usually morning); batch similar/admin work to cut context-switching; do urgent and near-deadline and high-priority work first; respect dependencies; insert short breaks (~5–10 min roughly every 90 min) and a longer break after deep work; keep it realistic using each task\'s estimate.',
            '- Place each task with schedule_task(task_id, start, end) using ISO timestamps within their available hours.',
            '- After scheduling, explain the plan in plain language: when each task happens, where the breaks go, and WHY you arranged it that way.',
            '- To replan, re-schedule the affected tasks. If a task is completed, added, or slips and they ask, rebalance the rest of the day around what remains.',
            '',
            '## Daily check-in',
            '- When the user starts a daily check-in, greet them warmly and briefly. Ask if they have any new tasks to add today. Whether or not they do, show today\'s priorities and scheduled plan and flag anything overdue. If they add tasks, help organize them. Keep it short and motivating — a good morning kick-off, not a wall of text.',
            '',
            '## Logging off for the day',
            '- When the user logs off for the day, give an end-of-day summary: what they completed today, what is still unfinished, anything overdue, roughly how much time they tracked today (from the figures below), one or two honest insights, and their top 2–3 priorities for tomorrow. Be concise and encouraging.',
            '',
            'Current goals:',
            goalLines || '(none)',
            '',
            'Current open tasks:',
            taskLines || '(none)',
            '',
            'Time tracked today:',
            timeLines,
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

    for (let i = 0; i < 4; i++) {
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
          goal_id: { type: 'STRING', description: 'Link to a goal id (from create_goal or the goals list)' },
        },
        required: ['title'],
      },
    },
    {
      name: 'create_goal',
      description:
        'Create a high-level goal/objective, optionally with milestones. Returns goal_id so you can link tasks to it with create_task.',
      parameters: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          description: { type: 'STRING' },
          category: { type: 'STRING' },
          target_date: { type: 'STRING', description: 'Deadline as ISO date (YYYY-MM-DD)' },
          milestones: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Ordered milestone titles',
          },
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
    {
      name: 'schedule_task',
      description: 'Place a task on the day timeline by setting its start and end time.',
      parameters: {
        type: 'OBJECT',
        properties: {
          task_id: { type: 'STRING' },
          start: { type: 'STRING', description: 'ISO 8601 start time' },
          end: { type: 'STRING', description: 'ISO 8601 end time' },
        },
        required: ['task_id', 'start', 'end'],
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
): Promise<{ ok: boolean; detail: string; error?: string; goal_id?: string }> {
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
        goal_id: args.goal_id ?? null,
        created_by: myId,
      }
      const { error } = await supabase.from('tasks').insert(row)
      if (error) throw error
      return { ok: true, detail: `Created task "${args.title}"` }
    }

    if (name === 'create_goal') {
      const { data, error } = await supabase
        .from('goals')
        .insert({
          title: args.title,
          description: args.description ?? null,
          category: args.category ?? null,
          target_date: args.target_date ?? null,
          owner_id: myId,
        })
        .select('id')
        .single()
      if (error) throw error
      const goalId = data.id as string

      const titles = Array.isArray(args.milestones) ? (args.milestones as unknown[]) : []
      if (titles.length) {
        await supabase.from('milestones').insert(
          titles.map((t, i) => ({ goal_id: goalId, title: String(t), sort_order: i })),
        )
      }
      return { ok: true, detail: `Created goal "${args.title}"`, goal_id: goalId }
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

    if (name === 'schedule_task') {
      const { error } = await supabase
        .from('tasks')
        .update({ scheduled_start: args.start, scheduled_end: args.end })
        .eq('id', args.task_id)
      if (error) throw error
      return { ok: true, detail: 'Scheduled a task' }
    }

    return { ok: false, detail: '', error: `Unknown tool ${name}` }
  } catch (e) {
    return { ok: false, detail: '', error: (e as Error).message }
  }
}
