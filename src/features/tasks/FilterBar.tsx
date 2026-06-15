import { Search, X } from 'lucide-react'
import type { Profile } from '@/lib/types'
import { PRIORITIES, STATUS_BADGE } from './constants'

export interface Filters {
  search: string
  assignee: string
  category: string
  priority: string
  status: string
}

export const EMPTY_FILTERS: Filters = {
  search: '',
  assignee: '',
  category: '',
  priority: '',
  status: '',
}

const select =
  'rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-slate-500'

interface Props {
  profiles: Profile[]
  categories: string[]
  filters: Filters
  onChange: (f: Filters) => void
}

export function FilterBar({ profiles, categories, filters, onChange }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })
  const active =
    filters.search || filters.assignee || filters.category || filters.priority || filters.status

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="Search tasks"
          className={`${select} pl-7`}
        />
      </div>

      <select className={select} value={filters.assignee} onChange={(e) => set({ assignee: e.target.value })}>
        <option value="">Anyone</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.display_name}
          </option>
        ))}
      </select>

      <select className={select} value={filters.category} onChange={(e) => set({ category: e.target.value })}>
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <select className={select} value={filters.priority} onChange={(e) => set({ priority: e.target.value })}>
        <option value="">Any priority</option>
        {PRIORITIES.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>

      <select className={select} value={filters.status} onChange={(e) => set({ status: e.target.value })}>
        <option value="">Any status</option>
        {(['not_started', 'in_progress', 'completed', 'overdue'] as const).map((s) => (
          <option key={s} value={s}>
            {STATUS_BADGE[s].label}
          </option>
        ))}
      </select>

      {active && (
        <button
          onClick={() => onChange(EMPTY_FILTERS)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          <X size={13} /> Clear
        </button>
      )}
    </div>
  )
}
