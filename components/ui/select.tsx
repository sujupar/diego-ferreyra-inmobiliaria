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
                "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
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
