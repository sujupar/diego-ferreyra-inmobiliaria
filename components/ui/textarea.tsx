'use client'

import * as React from "react"
import { cn } from "@/lib/utils"

export interface TextareaProps
    extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { }

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, ...props }, ref) => {
        return (
            <textarea
                className={cn(
                    // 16px en celular, 14px de `md:` para arriba — el MISMO patrón que
                    // `components/ui/input.tsx`. Por debajo de 16px iOS Safari hace zoom al
                    // enfocar y NO lo deshace al salir; el peor caso es el compositor del
                    // Inbox, donde el asesor toca para responder y se le va la conversación
                    // de la pantalla. El diseño de escritorio no cambia.
                    "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm ring-offset-background",
                    "placeholder:text-muted-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    "transition-all duration-200 resize-none",
                    className
                )}
                ref={ref}
                {...props}
            />
        )
    }
)
Textarea.displayName = "Textarea"

export { Textarea }
