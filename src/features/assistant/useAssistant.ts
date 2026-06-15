import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  actions?: { type: string; detail: string }[]
}

interface AgentResponse {
  reply: string
  actions?: { type: string; detail: string }[]
}

const GREETING: ChatMessage = {
  role: 'assistant',
  content:
    "Hi! I'm your Tandem Planner. Tell me what's on your plate — e.g. \"help me prep for the investor meeting next Friday\" — and I'll break it into tasks, estimate the time, and help you plan when to do it.",
}

export function useAssistant() {
  const qc = useQueryClient()
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING])
  const [loading, setLoading] = useState(false)

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const history = [...messages, { role: 'user', content: trimmed } as ChatMessage]
    setMessages(history)
    setLoading(true)

    try {
      // Only the role/content pairs go to the function (drop the greeting + action meta).
      const payload = history
        .filter((_, i) => i > 0)
        .map((m) => ({ role: m.role, content: m.content }))

      const { data, error } = await supabase.functions.invoke<AgentResponse>('ai-agent', {
        body: { messages: payload },
      })
      if (error) throw error

      setMessages([
        ...history,
        { role: 'assistant', content: data?.reply ?? 'Done.', actions: data?.actions },
      ])

      // If the agent changed data, refresh the live views.
      if (data?.actions?.length) {
        qc.invalidateQueries({ queryKey: ['tasks'] })
        qc.invalidateQueries({ queryKey: ['goals'] })
      }
    } catch (e) {
      setMessages([
        ...history,
        {
          role: 'assistant',
          content:
            "I couldn't reach the AI service. Make sure the `ai-agent` function is deployed and the Gemini key is set. (" +
            (e as Error).message +
            ')',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return { messages, loading, send }
}
