import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'

export function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await signIn(email.trim(), password)
    setBusy(false)
    if (error) {
      setError(error)
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <div className="grid h-full place-items-center bg-hearth-cream px-6">
      {/* Subtle texture overlay */}
      <div className="w-full max-w-sm">
        {/* Logo mark */}
        <div className="mb-8 text-center">
          {/* SVG hearth / flame icon */}
          <svg
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="mx-auto mb-4 h-14 w-14"
          >
            <path
              d="M32 6C32 6 14 20 14 36a18 18 0 0 0 36 0C50 20 32 6 32 6Z"
              fill="#1b2a1e"
            />
            <path
              d="M32 22c0 0-9 8-9 15a9 9 0 0 0 18 0C41 30 32 22 32 22Z"
              fill="#c2a76d"
            />
            <path
              d="M32 34c0 0-4 3.5-4 6.5a4 4 0 0 0 8 0C36 37.5 32 34 32 34Z"
              fill="#f9f7f2"
            />
          </svg>
          <h1 className="font-serif text-3xl font-semibold text-hearth-green tracking-wide">
            HearthHall
          </h1>
          <p className="mt-1 text-sm text-hearth-text">
            Your shared space to think, plan, and do.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-5 rounded-2xl border border-hearth-border bg-white/60 p-8 shadow-sm backdrop-blur"
        >
          <label className="block space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-widest text-hearth-text">
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-hearth-border bg-hearth-cream px-3 py-2 text-sm text-hearth-green outline-none transition focus:border-hearth-gold focus:ring-1 focus:ring-hearth-gold"
              autoComplete="email"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-widest text-hearth-text">
              Password
            </span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-hearth-border bg-hearth-cream px-3 py-2 text-sm text-hearth-green outline-none transition focus:border-hearth-gold focus:ring-1 focus:ring-hearth-gold"
              autoComplete="current-password"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-hearth-green px-3 py-2.5 text-sm font-medium text-hearth-cream transition hover:bg-hearth-text disabled:opacity-50"
          >
            {busy ? 'Signing in…' : 'Enter the Hall'}
          </button>

          <p className="text-center text-xs text-hearth-text/60">
            A private space — by invitation only.
          </p>
        </form>

        {/* Gold divider accent */}
        <div className="mt-6 flex items-center justify-center">
          <div className="h-px w-16 bg-hearth-gold/40" />
        </div>
      </div>
    </div>
  )
}
