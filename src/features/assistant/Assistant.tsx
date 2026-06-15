import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Bot, Send, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAssistant } from './useAssistant'

const SUGGESTIONS = [
  'Add a 1-hour deep-work block tomorrow to draft the pitch',
  "What's due today?",
  'Schedule a 30-min sync with Max on Friday at 2pm',
]

/** Always-present AI coach: floating button → chat panel (bottom-right). */
export function Assistant() {
  const [open, setOpen] = useState(false)
  const { messages, loading, send } = useAssistant()
  const [text, setText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, loading])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    send(text)
    setText('')
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-indigo-600 text-white shadow-lg transition hover:bg-indigo-500 md:bottom-6 md:right-6"
        title="Planner"
      >
        <Bot size={24} />
      </button>
    )
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex h-[70vh] flex-col rounded-t-2xl border border-slate-800 bg-slate-900 shadow-2xl md:inset-x-auto md:bottom-6 md:right-6 md:h-[32rem] md:w-96 md:rounded-2xl">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2 font-medium">
          <Sparkles size={16} className="text-indigo-400" /> Planner
        </div>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          <X size={18} />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                m.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-100',
              )}
            >
              <div className="whitespace-pre-wrap">{m.content}</div>
              {m.actions && m.actions.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-white/10 pt-2 text-xs text-slate-300">
                  {m.actions.map((a, j) => (
                    <div key={j}>✓ {a.detail}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && <div className="text-sm text-slate-500">Thinking…</div>}

        {messages.length === 1 && (
          <div className="space-y-1.5 pt-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="block w-full rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-left text-xs text-slate-400 transition hover:border-slate-700 hover:text-slate-200"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-slate-800 p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask or tell me anything…"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
        <button
          type="submit"
          disabled={loading || !text.trim()}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-600 text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  )
}
