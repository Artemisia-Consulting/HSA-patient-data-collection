'use client'

/**
 * The app's only button. Every variant clears the 44px touch floor by itself
 * rather than relying on the rule in globals.css, because that rule does not
 * cover anchors styled as buttons.
 *
 * OWNER: Stream 2.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-hsa-600 text-white shadow-sm hover:bg-hsa-700 active:bg-hsa-700 disabled:bg-neutral-400 dark:disabled:bg-neutral-700',
  secondary:
    'bg-white text-hsa-700 ring-1 ring-inset ring-hsa-600/40 hover:bg-hsa-50 dark:bg-neutral-800 dark:text-hsa-100 dark:ring-hsa-500/40 dark:hover:bg-neutral-700',
  ghost:
    'bg-transparent text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800',
  danger:
    'bg-red-600 text-white hover:bg-red-700 disabled:bg-neutral-400 dark:disabled:bg-neutral-700',
}

const SIZES: Record<Size, string> = {
  md: 'min-h-[44px] px-4 text-base',
  lg: 'min-h-[56px] px-5 text-lg',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
  busy?: boolean
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  busy = false,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold',
        'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hsa-600',
        'disabled:cursor-not-allowed disabled:opacity-80',
        VARIANTS[variant],
        SIZES[size],
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {busy ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  )
}
