'use client'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { puedeSaltarA } from '@/lib/portals/wizard-etapas'

interface Props {
  steps: readonly { id: string; label: string }[]
  idx: number
  /** Etapa más lejana ya visitada en esta sesión (ver lib/portals/wizard-etapas). */
  maxIdx: number
  stepValid: boolean
  saving: boolean
  onJump: (i: number) => void
}

/**
 * Pastillas del stepper de los wizards de portal (ML y Argenprop comparten
 * este componente). Son BOTONES: tocar una etapa ya vista lleva ahí directo
 * (pedido del dueño, 2026-09-14). La regla de a dónde se puede ir vive en
 * `puedeSaltarA`; acá solo se pinta y se deshabilita lo que no corresponde.
 */
export function StepperPills({ steps, idx, maxIdx, stepValid, saving, onJump }: Props) {
  return (
    <nav aria-label="Etapas de la publicación" className="flex items-center gap-1.5 text-xs flex-wrap">
      {steps.map((s, i) => {
        const habilitada = !saving && puedeSaltarA({ destino: i, actual: idx, maxAlcanzada: maxIdx, actualValida: stepValid })
        const color = i < idx
          ? 'bg-emerald-600 text-white'
          : i === idx
            ? 'bg-[color:var(--brand)] text-white'
            : 'bg-muted text-muted-foreground'
        const cursor = habilitada ? 'cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-[color:var(--brand)]/40' : i === idx ? 'cursor-default' : 'cursor-not-allowed opacity-70'
        return (
          <div key={s.id} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => { if (habilitada) onJump(i) }}
              disabled={!habilitada && i !== idx}
              aria-current={i === idx ? 'step' : undefined}
              aria-disabled={!habilitada}
              title={habilitada ? `Ir a ${s.label}` : i > maxIdx ? 'Todavía no llegaste a esta etapa' : undefined}
              className={`px-2.5 py-1 rounded-full transition ${color} ${cursor}`}
            >
              {i < idx && <CheckCircle2 className="h-3 w-3 inline mr-1" />}{s.label}
            </button>
            {i < steps.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
          </div>
        )
      })}
    </nav>
  )
}
