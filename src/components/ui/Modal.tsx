import type { ReactNode } from 'react'
import { X } from 'lucide-react'

/** Lightweight centered dialog. Click the backdrop or ✕ to close. */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-hearth-green/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-hearth-border bg-hearth-cream p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-hearth-green">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-hearth-text/50 transition hover:bg-hearth-muted hover:text-hearth-green"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
