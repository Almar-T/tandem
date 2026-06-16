import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'subtle' | 'ghost' | 'danger' | 'gold'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-hearth-green text-hearth-cream hover:bg-hearth-text',
  gold:    'bg-hearth-gold text-hearth-green hover:opacity-90',
  subtle:  'border border-hearth-border bg-hearth-muted text-hearth-green hover:bg-hearth-border',
  ghost:   'text-hearth-text hover:bg-hearth-muted',
  danger:  'text-red-700 hover:bg-red-50',
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  )
}
