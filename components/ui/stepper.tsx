'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

interface StepperProps {
    steps: { title: string; description?: string }[]
    currentStep: number
    className?: string
}

export function Stepper({ steps, currentStep, className }: StepperProps) {
    return (
        // PISO DE CELULAR — el desborde de esta barra arrastraba de costado a
        // TODA la página del asistente de tasación, en sus 6 pasos: los títulos
        // ('Ubicación', 'Superficies', 'Características'…) no se achican por
        // debajo de su palabra más larga, así que pedían ~532px contra los
        // ~358px de un iPhone. Abajo de `md` los títulos pasan a `sr-only`
        // (siguen para el lector de pantalla, dejan de ocupar lugar) y quedan
        // solo los círculos numerados, que es lo que de verdad orienta; el
        // "Paso N de 6" en letras lo pone `PropertyWizard`.
        //
        // `scroll-x-fade` es la red de seguridad: si aun sin los títulos los
        // círculos no entran (teléfonos de 320px), la barra scrollea DENTRO de
        // su caja en vez de empujar la página. No se acota a `max-md:`: entre
        // 768 y ~1100px de ventana la caja útil mide ~464px contra los ~532px
        // que piden los títulos, así que en esa franja de escritorio también
        // hace falta.
        //
        // `py-6 -my-6` — NO es aire, es el precio de tener un scroller acá.
        // `overflow-x: auto` obliga al eje Y a `auto` también (no existe
        // "desbordar en uno y recortar en el otro"), así que todo lo que el paso
        // ACTUAL dibuja fuera de su caja quedaba recortado con un corte recto:
        // el `scale-110`, la `shadow-lg` (que llega ~18px por debajo del
        // círculo) y sobre todo el `animate-ping`, que se expande al doble, o
        // sea 24px por lado. En escritorio, donde no hay nada que deslizar, era
        // puro daño.
        // El relleno le da a la tinta esos 24px arriba y abajo; el margen
        // negativo del mismo tamaño devuelve la caja a su lugar en el flujo, así
        // que la barra sigue midiendo y ubicándose EXACTAMENTE igual que antes,
        // en todos los anchos. Los dos números son el mismo a propósito: si
        // algún día crece el realce del paso actual, suben JUNTOS o vuelve el
        // recorte.
        <div className={cn('w-full scroll-x-fade py-6 -my-6', className)}>
            {/* `w-max min-w-full`: ocupa todo el ancho cuando entra (y los
                conectores `flex-1` reparten el sobrante) y crece hasta su
                contenido cuando no entra, que es lo que habilita el scroll. */}
            <div className="flex w-max min-w-full items-center justify-between">
                {steps.map((step, index) => {
                    const isCompleted = index < currentStep
                    const isCurrent = index === currentStep
                    const isUpcoming = index > currentStep

                    return (
                        <React.Fragment key={index}>
                            {/* Step indicator */}
                            <div className="flex shrink-0 flex-col items-center">
                                <div
                                    aria-current={isCurrent ? 'step' : undefined}
                                    className={cn(
                                        'relative flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all duration-500 ease-out max-md:h-10 max-md:w-10',
                                        isCompleted && 'border-primary bg-primary text-primary-foreground scale-100',
                                        isCurrent && 'border-primary bg-primary/10 text-primary scale-110 shadow-lg shadow-primary/25',
                                        isUpcoming && 'border-muted-foreground/30 bg-muted/50 text-muted-foreground'
                                    )}
                                >
                                    {isCompleted ? (
                                        <Check className="h-5 w-5 animate-in zoom-in-50 duration-300" />
                                    ) : (
                                        <span className={cn(
                                            'text-sm font-semibold transition-all duration-300',
                                            isCurrent && 'text-primary'
                                        )}>
                                            {index + 1}
                                        </span>
                                    )}

                                    {/* Pulse animation for current step */}
                                    {isCurrent && (
                                        <span className="absolute inset-0 rounded-full animate-ping bg-primary/20" />
                                    )}
                                </div>

                                {/* Step title */}
                                <div className="mt-3 text-center max-md:mt-0">
                                    <p
                                        className={cn(
                                            'text-sm font-medium transition-all duration-300 max-md:sr-only',
                                            isCompleted && 'text-primary',
                                            isCurrent && 'text-primary font-semibold',
                                            isUpcoming && 'text-muted-foreground'
                                        )}
                                    >
                                        {step.title}
                                    </p>
                                    {step.description && (
                                        <p className="mt-1 text-xs text-muted-foreground max-w-[100px] hidden sm:block">
                                            {step.description}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Connector line */}
                            {index < steps.length - 1 && (
                                // El `mt-[-24px]` compensa la altura del título
                                // para que la línea quede a la altura de los
                                // círculos. Sin títulos (celular) esa
                                // compensación sobra y desalinea.
                                <div className="flex-1 mx-2 sm:mx-4 mt-[-24px] max-md:mx-1 max-md:mt-0">
                                    <div className="relative h-1 bg-muted rounded-full overflow-hidden">
                                        <div
                                            className={cn(
                                                'absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-700 ease-out',
                                                isCompleted ? 'w-full' : 'w-0'
                                            )}
                                        />
                                        {/* Animated gradient for current step transition */}
                                        {isCurrent && (
                                            <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-primary/50 to-transparent animate-pulse" />
                                        )}
                                    </div>
                                </div>
                            )}
                        </React.Fragment>
                    )
                })}
            </div>
        </div>
    )
}

interface StepContentProps {
    children: React.ReactNode
    isActive: boolean
    direction?: 'forward' | 'backward'
}

export function StepContent({ children, isActive, direction = 'forward' }: StepContentProps) {
    if (!isActive) return null

    return (
        <div
            className={cn(
                'animate-in duration-500 ease-out',
                direction === 'forward'
                    ? 'slide-in-from-right-8 fade-in'
                    : 'slide-in-from-left-8 fade-in'
            )}
        >
            {children}
        </div>
    )
}
