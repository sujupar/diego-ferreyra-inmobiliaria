'use client'

import { CRM_STAGES } from './crm-stages'

interface Props {
  /**
   * Claves de etapa que este rol NO puede ver — las maneja el coordinador
   * antes de asignar asesor. Antes era un booleano `hideSolicitud` que solo
   * tapaba 'solicitud': 'Clase Gratuita' se le seguía ofreciendo al asesor,
   * clickeable, con el 0 forzado, y al tocarla devolvía lista vacía siempre
   * (D33). La lista la decide la página, que es la que también filtra los
   * deals en memoria y arma el desplegable "Etapa" con el MISMO criterio.
   */
  etapasOcultas: readonly string[]
  stageCounts: Record<string, number>
  /** Etapa activa — se pasa el valor MOSTRADO (espejo), no el aplicado, para
   * que el resalte responda al instante. */
  activeKey: string
  onToggle: (key: string) => void
}

/**
 * Grilla de etapas del pipeline — presentación pura, extraída de
 * `crm/page.tsx` (task-11-brief.md, Step 7) para bajar el archivo de las
 * ~700 líneas. La lógica de datos (fetch, filtros) se queda en la página.
 */
export function StagePipeline({ etapasOcultas, stageCounts, activeKey, onToggle }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
      {CRM_STAGES
        .filter(s => !etapasOcultas.includes(s.key))
        .map((s) => {
        const count = stageCounts[s.key] || 0
        const isActive = activeKey === s.key
        const Icon = s.icon
        return (
          <button
            key={s.key}
            onClick={() => onToggle(s.key)}
            className={`
              group relative rounded-xl border p-3 text-left transition-all duration-200
              bg-gradient-to-br ${s.gradient}
              ${isActive
                ? `ring-2 ${s.ringColor} shadow-lg scale-[1.02]`
                : 'hover:shadow-md hover:scale-[1.01] border-transparent'
              }
            `}
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${s.badgeBg}`}>
                <Icon className={`h-3.5 w-3.5 ${s.badgeText}`} />
              </div>
              {count > 0 && (
                <span className={`h-1.5 w-1.5 rounded-full ${s.dotColor}`} />
              )}
            </div>
            <p className="eyebrow truncate">{s.label}</p>
            <p className="display text-3xl tabular-nums mt-1">{count}</p>
          </button>
        )
      })}
    </div>
  )
}
