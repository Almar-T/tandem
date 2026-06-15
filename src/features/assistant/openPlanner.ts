const EVENT = 'tandem:open-planner'

/** Open the Planner panel from anywhere, optionally sending an initial prompt. */
export function openPlanner(prompt?: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: prompt }))
}

export const OPEN_PLANNER_EVENT = EVENT
