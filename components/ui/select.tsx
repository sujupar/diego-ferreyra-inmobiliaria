'use client'

import * as React from "react"
import { cn } from "@/lib/utils"

const Select = React.forwardRef<
    HTMLSelectElement,
    React.SelectHTMLAttributes<HTMLSelectElement> & {
        options: { value: string; label: string }[]
        placeholder?: string
    }
>(({ className, options, placeholder, ...props }, ref) => {
    return (
        <select
            className={cn(
                // Igual que Input/Textarea: 16px en celular para que iOS no haga zoom al
                // abrir el desplegable. El `<select>` NATIVO se mantiene a propósito — la
                // rueda del sistema es mejor que cualquier desplegable propio en una
                // pantalla táctil; acá solo se le sube la fuente.
                "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm ring-offset-background",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "transition-all duration-200",
                className
            )}
            ref={ref}
            {...props}
        >
            {placeholder && (
                <option value="" disabled>
                    {placeholder}
                </option>
            )}
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    )
})
Select.displayName = "Select"

export { Select }
