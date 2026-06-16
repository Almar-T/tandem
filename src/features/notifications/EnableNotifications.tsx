import { useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { enablePush, isPushEnabled, pushSupported } from './push'

const DISMISSED_KEY = 'hearth-push-dismissed'

export function EnableNotifications() {
  const { user } = useAuth()
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!pushSupported()) return
    if (localStorage.getItem(DISMISSED_KEY)) return
    isPushEnabled().then((on) => { if (!on) setVisible(true) })
  }, [])

  if (!visible) return null

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1')
    setVisible(false)
  }

  async function turnOn() {
    if (!user) return
    setBusy(true)
    setError(null)
    const res = await enablePush(user.id)
    setBusy(false)
    if (res.ok) {
      localStorage.removeItem(DISMISSED_KEY)
      setVisible(false)
    } else {
      setError(res.error ?? 'Could not enable notifications.')
    }
  }

  return (
    <div className="rounded-2xl border border-hearth-border bg-hearth-muted p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-hearth-green">
          <Bell size={16} className="text-hearth-gold" />
          Turn on reminders, overdue alerts &amp; daily summaries
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={turnOn}
            disabled={busy}
            className="rounded-lg bg-hearth-green px-3 py-1.5 text-sm font-medium text-hearth-cream transition hover:bg-hearth-text disabled:opacity-50"
          >
            {busy ? 'Enabling…' : 'Enable notifications'}
          </button>
          <button
            onClick={dismiss}
            className="rounded-lg p-1.5 text-hearth-text/40 transition hover:bg-hearth-border/40 hover:text-hearth-text"
            title="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
