import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { AuthProvider } from '@/auth/AuthProvider'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import { TimerProvider } from '@/features/timer/TimerProvider'
import { AppShell } from '@/components/AppShell'
import { Login } from '@/pages/Login'
import { Dashboard } from '@/pages/Dashboard'
import { Placeholder } from '@/pages/Placeholder'
import { TasksPage } from '@/features/tasks/TasksPage'
import { CalendarPage } from '@/features/dashboard/CalendarPage'
import { GoalsPage } from '@/features/goals/GoalsPage'

// Must match `base` in vite.config.ts so routing works under /tandem/ on GitHub Pages.
const BASENAME = '/tandem'

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TimerProvider>
        <BrowserRouter basename={BASENAME}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="tasks" element={<TasksPage />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="goals" element={<GoalsPage />} />
              <Route
                path="analytics"
                element={<Placeholder title="Analytics" phase="Phase 7" />}
              />
            </Route>
          </Routes>
        </BrowserRouter>
        </TimerProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
