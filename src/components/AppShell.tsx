import { useRef, useState, type FormEvent } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { LayoutDashboard, ListTodo, Target, BarChart2, Menu, X, LogOut, Pencil } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { Assistant } from '@/features/assistant/Assistant'
import { TimerBar } from '@/features/timer/TimerBar'
import { useDailyCheckin } from '@/features/checkin/useDailyCheckin'

const NAV = [
  { to: '/',          label: 'Home',      icon: LayoutDashboard, end: true },
  { to: '/tasks',     label: 'Tasks',     icon: ListTodo },
  { to: '/goals',     label: 'Goals',     icon: Target },
  { to: '/analytics', label: 'Analytics', icon: BarChart2 },
]

function DisplayNamePopover({ current, userId, onClose }: { current: string; userId: string; onClose: () => void }) {
  const [value, setValue] = useState(current)
  const [saving, setSaving] = useState(false)
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || trimmed === current) { onClose(); return }
    setSaving(true)
    await Promise.all([
      supabase.auth.updateUser({ data: { display_name: trimmed } }),
      supabase.from('profiles').update({ display_name: trimmed }).eq('id', userId),
    ])
    qc.invalidateQueries({ queryKey: ['profiles'] })
    setSaving(false)
    onClose()
    // Reload so auth user metadata refreshes in React state
    window.location.reload()
  }

  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-64 animate-fade-up">
      <div className="glass rounded-2xl p-4 shadow-xl">
        <p className="mb-3 text-xs font-medium text-hearth-text/60">Change your display name</p>
        <form onSubmit={save} className="flex gap-2">
          <input
            ref={inputRef}
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Your first name"
            className="flex-1 rounded-xl border border-hearth-border/60 bg-white/70 px-3 py-2 text-sm text-hearth-green outline-none focus:border-hearth-gold focus:ring-1 focus:ring-hearth-gold/30"
          />
          <button
            type="submit"
            disabled={saving || !value.trim()}
            className="rounded-xl bg-hearth-green px-3 py-2 text-xs font-medium text-hearth-cream shadow-sm transition hover:bg-hearth-text disabled:opacity-40"
          >
            {saving ? '…' : 'Save'}
          </button>
        </form>
      </div>
    </div>
  )
}

export function AppShell() {
  const { user, signOut } = useAuth()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [nameOpen, setNameOpen] = useState(false)
  const name = user?.user_metadata?.display_name ?? user?.email?.split('@')[0] ?? 'You'
  useDailyCheckin()

  const isDashboard = pathname === '/'

  return (
    <div className="flex h-full flex-col">
      {/* ── Top bar ────────────────────────────────────────────── */}
      <header className="glass sticky top-0 z-30 flex items-center justify-between border-b border-hearth-border/40 px-5 py-3 shadow-sm">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <svg viewBox="0 0 32 32" fill="none" className="h-7 w-7 shrink-0">
            <path d="M16 3C16 3 7 10.5 7 18a9 9 0 0 0 18 0C25 10.5 16 3 16 3Z" fill="#1b2a1e" />
            <path d="M16 11c0 0-4.5 4-4.5 7.5a4.5 4.5 0 0 0 9 0C20.5 15 16 11 16 11Z" fill="#c2a76d" />
            <path d="M16 17c0 0-2 1.75-2 3.25a2 2 0 0 0 4 0C18 18.75 16 17 16 17Z" fill="#f9f7f2" />
          </svg>
          <span className="font-serif text-lg font-semibold tracking-wide text-hearth-green">HearthHall</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Clickable name → display name editor */}
          <div className="relative hidden md:block">
            <button
              onClick={() => setNameOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-hearth-text/60 transition hover:bg-hearth-muted hover:text-hearth-green"
            >
              {name}
              <Pencil size={11} className="opacity-50" />
            </button>
            {nameOpen && user && (
              <DisplayNamePopover
                current={name}
                userId={user.id}
                onClose={() => setNameOpen(false)}
              />
            )}
          </div>
          <button
            onClick={signOut}
            className="rounded-lg p-2 text-hearth-text/50 transition hover:bg-hearth-muted hover:text-hearth-green"
            title="Sign out"
          >
            <LogOut size={15} />
          </button>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-lg p-2 text-hearth-text/60 transition hover:bg-hearth-muted hover:text-hearth-green"
            title="Navigation"
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>

      {/* ── Collapsible nav drawer ──────────────────────────────── */}
      {menuOpen && (
        <nav className="glass animate-fade-up z-20 border-b border-hearth-border/40 px-5 py-3 shadow-md">
          <div className="mx-auto flex max-w-lg flex-wrap justify-center gap-2">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition',
                    isActive
                      ? 'bg-hearth-green text-hearth-cream shadow-sm'
                      : 'text-hearth-text hover:bg-hearth-muted',
                  )
                }
              >
                <Icon size={15} />
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}

      {/* ── Main content ───────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-5 pb-24">
          <Outlet />
        </div>
      </main>

      {/* Timer running indicator (only shows when active) */}
      <TimerBar />

      {/* Floating Heather button — hidden on dashboard (it's inline there) */}
      {!isDashboard && <Assistant />}
    </div>
  )
}
