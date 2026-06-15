import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  ListTodo,
  Calendar,
  Target,
  BarChart3,
  LogOut,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { cn } from '@/lib/cn'
import { Assistant } from '@/features/assistant/Assistant'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/tasks', label: 'Tasks', icon: ListTodo },
  { to: '/calendar', label: 'Calendar', icon: Calendar },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
]

export function AppShell() {
  const { user, signOut } = useAuth()
  const name = user?.user_metadata?.display_name ?? user?.email?.split('@')[0] ?? 'You'

  return (
    <div className="flex h-full flex-col">
      {/* Top bar — primary nav on desktop. */}
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-6">
          <span className="text-lg font-semibold tracking-tight">Tandem</span>
          <nav className="hidden gap-1 md:flex">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition',
                    isActive
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200',
                  )
                }
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">{name}</span>
          <button
            onClick={signOut}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Routed content. */}
      <main className="flex-1 overflow-y-auto p-4 pb-20 md:pb-4">
        <Outlet />
      </main>

      {/* Bottom tab bar — mobile only. */}
      <nav className="fixed inset-x-0 bottom-0 flex justify-around border-t border-slate-800 bg-slate-950/95 py-2 backdrop-blur md:hidden">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 px-3 py-1 text-[10px]',
                isActive ? 'text-indigo-400' : 'text-slate-500',
              )
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Always-present AI coach. */}
      <Assistant />
    </div>
  )
}
