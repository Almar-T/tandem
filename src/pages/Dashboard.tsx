import { Moon, Plus } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/Button'
import { GoalsBar } from '@/features/goals/GoalsBar'
import { Calendar } from '@/features/dashboard/Calendar'
import { DayPlan } from '@/features/dashboard/DayPlan'
import { TodayPanel } from '@/features/dashboard/TodayPanel'
import { EnableNotifications } from '@/features/notifications/EnableNotifications'
import { openPlanner } from '@/features/assistant/openPlanner'
import { useTasks } from '@/features/tasks/useTasks'
import { useTaskEditor } from '@/features/tasks/useTaskEditor'
import { TaskEditor } from '@/features/tasks/TaskEditor'

/** The central hub: pinned goals, an interactive calendar, and today's focus. */
export function Dashboard() {
  const { user } = useAuth()
  const { data: tasks = [] } = useTasks()
  const ed = useTaskEditor()
  const name = user?.user_metadata?.display_name ?? user?.email?.split('@')[0] ?? 'there'

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Good to see you, {name}</h1>
        <div className="flex gap-2">
          <Button
            variant="subtle"
            onClick={() =>
              openPlanner(
                "Log off for the day — give me my end-of-day summary: what I completed today, what's still unfinished, anything overdue, roughly how much time I tracked today, one or two insights, and my top priorities for tomorrow.",
              )
            }
          >
            <Moon size={16} /> End day
          </Button>
          <Button onClick={() => ed.openNew()}>
            <Plus size={16} /> New task
          </Button>
        </div>
      </div>

      <EnableNotifications />

      <GoalsBar tasks={tasks} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <DayPlan tasks={tasks} onSelectTask={ed.openEdit} />
          <Calendar tasks={tasks} onSelectTask={ed.openEdit} onSelectDay={ed.openNew} />
        </div>
        <TodayPanel tasks={tasks} onSelectTask={ed.openEdit} />
      </div>

      <TaskEditor open={ed.open} onClose={ed.close} task={ed.task} defaultDue={ed.defaultDue} />
    </div>
  )
}
