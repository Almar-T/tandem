import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Send, X, Flame } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAssistant } from './useAssistant'
import { OPEN_PLANNER_EVENT } from './openPlanner'

const SUGGESTIONS = [
  "What should I focus on today?",
  'Plan my morning — I have 2 hours free',
  "What's still unfinished this week?",
]

/** Always-present AI coach: floating button → full chat panel (bottom-right). */
export function Assistant() {
  const [open, setOpen] = useState(false)
  const { messages, loading, send } = useAssistant()
  const [text, setText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, loading])

  useEffect(() => {
    function handler(e: Event) {
      setOpen(true)
      const prompt = (e as CustomEvent<string | undefined>).detail
      if (prompt) send(prompt)
    }
    window.addEventListener(OPEN_PLANNER_EVENT, handler as EventListener)
    return () => window.removeEventListener(OPEN_PLANNER_EVENT, handler as EventListener)
  }, [send])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    send(text)
    setText('')
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-hearth-green text-hearth-cream shadow-lg transition hover:bg-hearth-text md:bottom-6 md:right-6"
        title="Open Vera — your AI planner"
      >
        <Flame size={22} />
      </button>
    )
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-2xl border border-hearth-border bg-hearth-cream shadow-2xl md:inset-x-auto md:bottom-6 md:right-6 md:h-[36rem] md:w-[26rem] md:rounded-2xl">
      {/* Header */}
      <header className="flex items-center justify-between rounded-t-2xl border-b border-hearth-border bg-hearth-green px-4 py-3">
        <div className="flex items-center gap-2">
          <Flame size={16} className="text-hearth-gold" />
          <span className="font-serif text-base font-medium text-hearth-cream">Vera</span>
          <span className="text-xs text-hearth-cream/50">· your AI planner</span>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg p-1 text-hearth-cream/50 transition hover:bg-white/10 hover:text-hearth-cream"
        >
          <X size={16} />
        </button>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                m.role === 'user'
                  ? 'bg-hearth-green text-hearth-cream'
                  : 'border border-hearth-border bg-white text-hearth-green',
              )}
            >
              <div className="whitespace-pre-wrap">{m.content}</div>
              {m.actions && m.actions.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-hearth-gold/20 pt-2 text-xs text-hearth-text/70">
                  {m.actions.map((a, j) => (
                    <div key={j} className="flex items-start gap-1">
                      <span className="text-hearth-gold">✓</span>
                      <span>{a.detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-1.5 text-sm text-hearth-text/50">
            <Flame size={13} className="animate-pulse text-hearth-gold" />
            Thinking…
          </div>
        )}

        {messages.length === 1 && (
          <div className="space-y-2 pt-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="block w-full rounded-xl border border-hearth-border bg-hearth-muted px-3 py-2 text-left text-xs text-hearth-text transition hover:border-hearth-gold hover:bg-white"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 border-t border-hearth-border bg-white/60 p-3"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask or tell Vera anything…"
          className="flex-1 rounded-lg border border-hearth-border bg-hearth-cream px-3 py-2 text-sm text-hearth-green outline-none transition focus:border-hearth-gold focus:ring-1 focus:ring-hearth-gold/40"
        />
        <button
          type="submit"
          disabled={loading || !text.trim()}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-hearth-green text-hearth-cream transition hover:bg-hearth-text disabled:opacity-40"
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  )
}
