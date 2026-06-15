import { useEffect } from 'react'
import { openPlanner } from '@/features/assistant/openPlanner'

/**
 * On the first visit each day, kick off a daily check-in: open the Planner and
 * have it greet, ask for new tasks, and surface today's priorities + overdue
 * items. Gated by localStorage so it only fires once per calendar day.
 */
export function useDailyCheckin() {
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    const key = `tandem-checkin-${today}`
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, '1')
    const id = setTimeout(() => {
      openPlanner(
        "Daily check-in — it's the start of my day. Greet me briefly, ask if I have any new tasks to add, then show my top priorities, today's plan, and anything overdue.",
      )
    }, 1200)
    return () => clearTimeout(id)
  }, [])
}
