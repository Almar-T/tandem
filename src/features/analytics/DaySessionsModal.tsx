import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2, Check, X, Clock } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { format, isSameDay } from '@/lib/dates'
import type { Task, WorkSession } from '@/lib/types'

function fmtTime(iso: string) {
  return format(new Date(iso), 'h:mm a')
}

function fmtDuration(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  if (m > 0) return `${m}m`
  return '< 1m'
}

function wallSec(s: WorkSession) {
  if (!s.ended_at) return null
  return Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000)
}

export function DaySessionsModal({
  day,
  userId,
  sessions,
  tasks,
  onClose,
}: {
  day: Date | null
  userId: string
  sessions: WorkSession[]
  tasks: Task[]
  onClose: () => void
}) {
  const { user } = useAuth()
  const qc = useQueryClient()

  const [editingId, setEditingId]   = useState<string | null>(null)
  const [editHours, setEditHours]   = useState(0)
  const [editMins, setEditMins]     = useState(0)
  const [saving, setSaving]         = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting]     = useState(false)

  if (!day) return null

  const daySessions = sessions
    .filter((s) => s.user_id === userId && isSameDay(new Date(s.started_at), day))
    .sort((a, b) => a.started_at.localeCompare(b.started_at))

  const totalSec = daySessions.reduce((n, s) => n + s.active_sec, 0)
  const isOwnDay = user?.id === userId

  function startEdit(s: WorkSession) {
    setConfirmDelete(null)
    setEditingId(s.id)
    setEditHours(Math.floor(s.active_sec / 3600))
    setEditMins(Math.floor((s.active_sec % 3600) / 60))
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function saveEdit(sessionId: string) {
    const session = daySessions.find((s) => s.id === sessionId)
    const maxSec = session ? (wallSec(session) ?? Infinity) : Infinity
    const newSec = Math.min(Math.max(0, editHours * 3600 + editMins * 60), maxSec)
    setSaving(true)
    try {
      const { error } = await supabase
        .from('work_sessions')
        .update({ active_sec: newSec })
        .eq('id', sessionId)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['work_sessions'] })
      setEditingId(null)
    } finally {
      setSaving(false)
    }
  }

  async function doDelete(sessionId: string) {
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('work_sessions')
        .delete()
        .eq('id', sessionId)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['work_sessions'] })
      setConfirmDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Modal
      open={day !== null}
      onClose={onClose}
      title={format(day, 'EEEE, MMMM d')}
    >
      {/* Day summary */}
      <div className="mb-4 flex items-center gap-2 text-xs text-hearth-text/50">
        <Clock size={12} />
        {daySessions.length === 0
          ? 'No sessions recorded'
          : `${daySessions.length} session${daySessions.length !== 1 ? 's' : ''} · ${fmtDuration(totalSec)} active`}
      </div>

      {daySessions.length === 0 && (
        <p className="py-8 text-center text-sm text-hearth-text/40">
          Nothing to edit here.
        </p>
      )}

      <div className="space-y-2">
        {daySessions.map((s) => {
          const task     = tasks.find((t) => t.id === s.task_id)
          const wall     = wallSec(s)
          const isEditing  = editingId === s.id
          const isConfirm  = confirmDelete === s.id

          return (
            <div
              key={s.id}
              className="overflow-hidden rounded-xl border border-hearth-border/50 bg-white/60"
            >
              {/* Session header row */}
              <div className="flex items-start justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-hearth-green">
                    {task?.title ?? 'General'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-hearth-text/50">
                    {fmtTime(s.started_at)}
                    {s.ended_at ? ` – ${fmtTime(s.ended_at)}` : ' · ongoing'}
                    {wall !== null && ` · ${fmtDuration(wall)} wall time`}
                  </p>
                </div>

                {!isEditing && !isConfirm && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-sm font-semibold tabular-nums text-hearth-green">
                      {fmtDuration(s.active_sec)}
                    </span>
                    {isOwnDay && (
                      <>
                        <button
                          onClick={() => startEdit(s)}
                          className="rounded-lg p-1.5 text-hearth-text/40 transition hover:bg-hearth-muted hover:text-hearth-green"
                          title="Edit active time"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => { setEditingId(null); setConfirmDelete(s.id) }}
                          className="rounded-lg p-1.5 text-hearth-text/40 transition hover:bg-red-50 hover:text-red-500"
                          title="Remove session"
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Edit active time */}
              {isEditing && (
                <div className="border-t border-hearth-border/30 bg-hearth-muted/50 px-4 py-3">
                  <p className="mb-2 text-[11px] text-hearth-text/50">
                    Set active time
                    {wall !== null && ` (max ${fmtDuration(wall)})`}
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={23}
                        value={editHours}
                        onChange={(e) => setEditHours(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                        className="w-14 rounded-lg border border-hearth-border bg-hearth-cream px-2 py-1.5 text-center text-sm text-hearth-green outline-none focus:border-hearth-gold"
                      />
                      <span className="text-xs text-hearth-text/50">h</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={editMins}
                        onChange={(e) => setEditMins(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                        className="w-14 rounded-lg border border-hearth-border bg-hearth-cream px-2 py-1.5 text-center text-sm text-hearth-green outline-none focus:border-hearth-gold"
                      />
                      <span className="text-xs text-hearth-text/50">m</span>
                    </div>
                    <div className="ml-auto flex items-center gap-1.5">
                      <button
                        onClick={() => saveEdit(s.id)}
                        disabled={saving}
                        className="flex items-center gap-1 rounded-lg bg-hearth-green px-3 py-1.5 text-xs font-medium text-hearth-cream transition hover:bg-hearth-text disabled:opacity-50"
                      >
                        <Check size={11} />
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="rounded-lg p-1.5 text-hearth-text/40 transition hover:bg-hearth-muted hover:text-hearth-green"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Delete confirmation */}
              {isConfirm && (
                <div className="border-t border-red-100 bg-red-50/60 px-4 py-3">
                  <p className="mb-2 text-[11px] text-red-600">
                    Remove this session permanently?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => doDelete(s.id)}
                      disabled={deleting}
                      className="flex items-center gap-1 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-600 disabled:opacity-50"
                    >
                      <Trash2 size={11} />
                      Remove
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="rounded-lg border border-hearth-border px-3 py-1.5 text-xs text-hearth-text/60 transition hover:bg-hearth-muted"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {daySessions.length > 0 && isOwnDay && (
        <p className="mt-4 text-[10px] text-hearth-text/40">
          Editing only affects your own sessions. Changes are reflected immediately in all views.
        </p>
      )}
    </Modal>
  )
}
