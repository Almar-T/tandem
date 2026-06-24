import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mb-1 mt-2 font-serif text-base font-semibold text-hearth-green">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-1 mt-2 font-serif text-sm font-semibold text-hearth-green">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-0.5 mt-1.5 font-serif text-sm font-medium text-hearth-green">{children}</h3>
  ),
  p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-1.5 ml-4 list-disc space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="mb-1.5 ml-4 list-decimal space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="leading-snug">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-hearth-green">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="my-1.5 border-l-2 border-hearth-gold pl-3 text-hearth-text/80 italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-2 border-hearth-border" />,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-hearth-border bg-hearth-muted px-2 py-1 text-left font-semibold text-hearth-green">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-hearth-border px-2 py-1 text-hearth-text">{children}</td>
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = 'node' in props
    if (isBlock) {
      return (
        <pre className="my-2 overflow-x-auto rounded-lg bg-hearth-muted p-3 text-xs text-hearth-text">
          <code>{children}</code>
        </pre>
      )
    }
    return (
      <code className="rounded bg-hearth-muted px-1 py-0.5 font-mono text-xs text-hearth-green">
        {children}
      </code>
    )
  },
}

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  )
}
