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
    <div className="grid h-full place-items-center px-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-xl"
      >
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Tandem</h1>
          <p className="text-sm text-slate-400">Your shared work OS. Sign in to continue.</p>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-400">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-slate-500"
            autoComplete="email"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-400">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-slate-500"
            autoComplete="current-password"
          />
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-center text-xs text-slate-500">
          Accounts are created by invite only (just the two of us).
        </p>
      </form>
    </div>
  )
}
