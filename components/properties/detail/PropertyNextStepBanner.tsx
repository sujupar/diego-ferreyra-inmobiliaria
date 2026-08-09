'use client'

import type { ReactNode } from 'react'
import { AlertTriangle, Info, XCircle, Archive, Loader2, ArrowRight, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { NextStep, NextStepTone, TabKey } from '@/lib/properties/detail-view'

const TONES: Record<NextStepTone, { box: string; icon: typeof Info; iconColor: string }> = {
  info: { box: 'border-[color:var(--brand)]/30 bg-[color:var(--brand-soft)]/25', icon: Info, iconColor: 'text-[color:var(--brand)]' },
  warn: { box: 'border-amber-300 bg-amber-50/60 dark:bg-amber-950/20', icon: AlertTriangle, iconColor: 'text-amber-600' },
  danger: { box: 'border-red-300 bg-red-50/60 dark:bg-red-950/20', icon: XCircle, iconColor: 'text-[color:var(--destructive)]' },
  neutral: { box: 'border-slate-300 bg-muted/40', icon: Archive, iconColor: 'text-muted-foreground' },
}

interface Props {
  step: NextStep | null
  submitting: boolean
  onGoToTab: (tab: TabKey) => void
  onSubmitReview: () => void
  /** Abre el selector de archivos de la página, sin cambiar de pestaña. */
  onSubirFotos: () => void
  subiendoFotos?: boolean
  /** Detalle opcional plegable (ej. los campos importados de GHL). */
  details?: ReactNode
}

export function PropertyNextStepBanner({ step, submitting, onGoToTab, onSubmitReview, onSubirFotos, subiendoFotos, details }: Props) {
  if (!step) return null
  const tone = TONES[step.tone]
  const Icon = tone.icon
  // A una const local: dentro de los callbacks, TypeScript conserva el estrechado
  // de la unión y así el botón de pestaña llega a `.tab` sin ningún cast.
  const accion = step.action

  return (
    <div className={`rounded-2xl border px-5 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${tone.box}`}>
      <div className="flex items-start gap-3 min-w-0">
        <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${tone.iconColor}`} />
        <div className="min-w-0">
          <p className="font-medium">{step.title}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{step.text}</p>
          {details}
        </div>
      </div>

      {accion && (
        <div className="shrink-0">
          {accion.kind === 'submit-review' ? (
            <Button onClick={onSubmitReview} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {accion.label}
            </Button>
          ) : accion.kind === 'subir-fotos' ? (
            <Button onClick={onSubirFotos} disabled={subiendoFotos}>
              {subiendoFotos ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
              {accion.label}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onGoToTab(accion.tab)}>
              {accion.label}
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
