import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, ListTodo, Target, LogOut } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { cn } from '@/lib/cn'
import { Assistant } from '@/features/assistant/Assistant'
import { TimerBar } from '@/features/timer/TimerBar'
import { useDailyCheckin } from '@/features/checkin/useDailyCheckin'

const NAV = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/tasks', label: 'Tasks', icon: ListTodo },
  { to: '/goals', label: 'Goals', icon: Target },
]

export function AppShell() {
  const { user, signOut } = useAuth()
  const name = user?.user_metadata?.display_name ?? user?.email?.split('@')[0] ?? 'You'
  useDailyCheckin()

  return (
    <div className="flex h-full flex-col bg-hearth-cream">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-hearth-border bg-hearth-cream px-5 py-3">
        <div className="flex items-center gap-8">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <svg viewBox="0 0 32 32" fill="none" className="h-7 w-7">
              <path
                d="M16 3C16 3 7 10.5 7 18a9 9 0 0 0 18 0C25 10.5 16 3 16 3Z"
                fill="#1b2a1e"
              />
              <path
                d="M16 11c0 0-4.5 4-4.5 7.5a4.5 4.5 0 0 0 9 0C20.5 15 16 11 16 11Z"
                fill="#c2a76d"
              />
              <path
                d="M16 17c0 0-2 1.75-2 3.25a2 2 0 0 0 4 0C18 18.75 16 17 16 17Z"
                fill="#f9f7f2"
              />
            </svg>
            <span className="font-serif text-xl font-semibold text-hearth-green tracking-wide">
              HearthHall
            </span>
          </div>

          {/* Desktop nav — only 3 items */}
          <nav className="hidden gap-0.5 md:flex">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition',
                    isActive
                      ? 'bg-hearth-green text-hearth-cream'
                      : 'text-hearth-text hover:bg-hearth-muted',
                  )
                }
              >
                <Icon size={15} />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-hearth-text/70 md:block">{name}</span>
          <button
            onClick={signOut}
            className="rounded-lg p-2 text-hearth-text/50 transition hover:bg-hearth-muted hover:text-hearth-green"
            title="Sign out"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* Routed content */}
      <main className="flex-1 overflow-y-auto p-5 pb-20 md:pb-5">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar — only 3 items */}
      <nav className="fixed inset-x-0 bottom-0 flex justify-around border-t border-hearth-border bg-hearth-cream/95 py-2 backdrop-blur md:hidden">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 px-4 py-1 text-[10px]',
                isActive ? 'text-hearth-green font-medium' : 'text-hearth-text/50',
              )
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>

      <TimerBar />
      <Assistant />
    </div>
  )
}
