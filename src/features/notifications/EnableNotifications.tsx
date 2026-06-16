import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { enablePush, isPushEnabled, pushSupported } from './push'

/** Dashboard banner prompting the user to turn on push notifications. Hides once on. */
export function EnableNotifications() {
  const { user } = useAuth()
  const [enabled, setEnabled] = useState(true) // assume on until checked, to avoid a flash
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    isPushEnabled().then(setEnabled)
  }, [])

  if (!pushSupported() || enabled) return null

  async function turnOn() {
    if (!user) return
    setBusy(true)
    setError(null)
    const res = await enablePush(user.id)
    setBusy(false)
    if (res.ok) setEnabled(true)
    else setError(res.error ?? 'Could not enable notifications.')
  }

  return (
    <div className="rounded-2xl border border-hearth-border bg-hearth-muted p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-hearth-green">
          <Bell size={16} className="text-hearth-gold" />
          Turn on reminders, overdue alerts &amp; daily summaries
        </div>
        <button
          onClick={turnOn}
          disabled={busy}
          className="rounded-lg bg-hearth-green px-3 py-1.5 text-sm font-medium text-hearth-cream transition hover:bg-hearth-text disabled:opacity-50"
        >
          {busy ? 'Enabling…' : 'Enable notifications'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
