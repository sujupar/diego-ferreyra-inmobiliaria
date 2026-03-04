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
        <div className={cn('w-full', className)}>
            <div className="flex items-center justify-between">
                {steps.map((step, index) => {
                    const isCompleted = index < currentStep
                    const isCurrent = index === currentStep
                    const isUpcoming = index > currentStep

                    return (
                        <React.Fragment key={index}>
                            {/* Step indicator */}
                            <div className="flex flex-col items-center">
                                <div
                                    className={cn(
                                        'relative flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all duration-500 ease-out',
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
                                <div className="mt-3 text-center">
                                    <p
                                        className={cn(
                                            'text-sm font-medium transition-all duration-300',
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
                                <div className="flex-1 mx-2 sm:mx-4 mt-[-24px]">
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
