import { Calendar } from './Calendar'
import { useTasks } from '@/features/tasks/useTasks'
import { useTaskEditor } from '@/features/tasks/useTaskEditor'
import { TaskEditor } from '@/features/tasks/TaskEditor'

/** Full-width calendar view (the /calendar route). */
export function CalendarPage() {
  const { data: tasks = [] } = useTasks()
  const ed = useTaskEditor()

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold">Calendar</h1>
      <Calendar tasks={tasks} onSelectTask={ed.openEdit} onSelectDay={ed.openNew} />
      <TaskEditor open={ed.open} onClose={ed.close} task={ed.task} defaultDue={ed.defaultDue} />
    </div>
  )
}
