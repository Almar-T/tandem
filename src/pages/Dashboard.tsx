import { useAuth } from '@/auth/AuthProvider'

/**
 * Phase 0 dashboard placeholder — confirms you're signed in on this device.
 * Phases 1–8 fill this in: pinned goals, calendar, today panel, productivity,
 * and AI recommendations.
 */
export function Dashboard() {
  const { user } = useAuth()
  const name = user?.user_metadata?.display_name ?? user?.email?.split('@')[0] ?? 'there'

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h1 className="text-xl font-semibold">Welcome to Tandem, {name} 👋</h1>
        <p className="mt-2 text-sm text-slate-400">
          You're signed in. This is the calendar dashboard hub — it'll grow over the next
          phases into your pinned goals, an interactive calendar, today's tasks, productivity
          stats, and AI recommendations.
        </p>
      </div>

      <ol className="space-y-2 text-sm text-slate-400">
        {[
          'Phase 1 — shared tasks with real-time sync',
          'Phase 2 — calendar dashboard + pinned goals',
          'Phase 3 — AI task creation',
          'Phase 4 — goals + AI breakdown',
          'Phase 5 — AI day planner',
          'Phase 6 — timer + productivity states',
          'Phase 7 — analytics',
          'Phase 8 — notifications, daily check-in, log off',
        ].map((step) => (
          <li
            key={step}
            className="rounded-lg border border-slate-800/60 bg-slate-900/30 px-4 py-2"
          >
            {step}
          </li>
        ))}
      </ol>
    </div>
  )
}
