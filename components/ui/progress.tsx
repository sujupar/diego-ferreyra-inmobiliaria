'use client'

import * as React from 'react'

/**
 * Progress bar simple basada en Tailwind (sin Radix). API compatible con
 * shadcn/ui: <Progress value={0-100} />.
 */
interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number | null
}

export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ value, className, ...rest }, ref) => {
    const pct = Math.max(0, Math.min(100, value ?? 0))
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className={`relative h-2 w-full overflow-hidden rounded-full bg-muted ${className ?? ''}`}
        {...rest}
      >
        <div
          className="h-full bg-[color:var(--brand)] transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    )
  },
)
Progress.displayName = 'Progress'
