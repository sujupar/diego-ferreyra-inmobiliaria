'use client'

import type { Panel } from '@/lib/metrics/panel/servidor'
import { diasEntre } from '@/lib/metrics/panel/rango'
import { REALIZADAS_SIN_DATO_HASTA } from '@/lib/metrics/panel/embudo'
import { DeDondeSale, Variacion } from './DeDondeSale'
import { num, pct, usd, variacion } from './formato'

export const NOMBRE_EMBUDO = { tasacion: 'Embudo de tasación', clase: 'Embudo de la clase gratuita' } as const
const NOMBRE_SOLICITUD = { tasacion: 'Solicitudes de tasación', clase: 'Registros a la clase' } as const

const ETAPA: Record<string, { label: string; ayuda: string }> = {
  solicitud: { label: '', ayuda: 'Personas únicas que se registraron. Si alguien pidió dos veces, cuenta una. Sin pruebas ni colegas.' },
  agendada: { label: 'Tasaciones agendadas', ayuda: 'Personas con una tasación coordinada. Cuenta también como solicitud, nunca dos veces.' },
  realizada: { label: 'Tasaciones realizadas', ayuda: 'Visita hecha o informe de tasación cargado.' },
  entregada: { label: 'Tasaciones entregadas', ayuda: 'Informe entregado al propietario.' },
  captada: { label: 'Propiedades captadas', ayuda: 'Autorización firmada. Incluye 3 captaciones rastreadas a mano por teléfono (Boedo 1900, Salta 297, Pico 4690).' },
}

export function EmbudoCanal({ embudo, panel, alcance, vista, onVista }: {
  embudo: 'tasacion' | 'clase'
  panel: Panel
  alcance: number | null | undefined
  vista: 'eventos' | 'cohorte'
  onVista: (v: 'eventos' | 'cohorte') => void
}) {
  const a = panel.actual.canales[embudo], b = panel.anterior?.canales[embudo]
  const dias = diasEntre(panel.parametros.rango)
  // El gasto de Meta está cargado desde 01/2026: un período comparado sin
  // ningún día con gasto NO costó $0, no tiene dato. Mostrar 0 inventaría
  // variaciones de +900%.
  const antesMeta = <T,>(x: T | undefined) => (b && b.diasConGasto === 0 ? null : x)
  const filas: { label: string; ayuda: string; valor: number | null; antes: number | null | undefined; pctPaso?: number | null; pctSol?: number | null; costo?: number | null; esPlata?: boolean; texto?: string }[] = [
    { label: 'Inversión', ayuda: `Gasto en Meta de las campañas de este embudo, en USD al blue de cada día. Hay gasto cargado en ${a.diasConGasto} de ${dias} días.`, valor: a.inversionUsd, antes: antesMeta(b?.inversionUsd), esPlata: true },
    { label: 'Alcance', ayuda: 'Personas únicas que vieron un anuncio en el período (Meta). No se suma por día: una persona que lo vio dos días es una.', valor: alcance ?? null, antes: undefined, texto: alcance === undefined ? 'cargando…' : undefined },
    { label: 'Clics al anuncio', ayuda: 'Clics en el enlace del anuncio (Meta).', valor: a.clics, antes: antesMeta(b?.clics), costo: a.costoPorClic },
    { label: 'Visitas a la landing', ayuda: 'Desde el 20/7/2026, personas distintas por día que entraron a la landing, medidas por la plataforma (sin robots; recargar no suma). Antes, las visitas que informa Meta. Tasación nov-25 a mar-26: sin dato.', valor: a.visitas, antes: antesMeta(b?.visitas), pctPaso: a.visitas != null && a.clics ? a.visitas / a.clics : null },
    ...a.pasos.map((p, i) => ({
      label: i === 0 ? NOMBRE_SOLICITUD[embudo] : ETAPA[p.etapa].label,
      ayuda: ETAPA[p.etapa].ayuda,
      valor: p.cantidad,
      antes: b?.pasos[i].cantidad,
      pctPaso: i === 0 ? a.conversionLanding : p.pctPaso,
      pctSol: i === 0 ? null : p.pctSolicitud,
      costo: p.costoUsd,
    })),
  ]

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-2">
        <div>
          <h3 className="font-semibold">{NOMBRE_EMBUDO[embudo]}</h3>
          <p className="text-xs text-muted-foreground">
            {vista === 'eventos' ? 'Cada paso contado en la fecha en que ocurrió.' : 'De las personas que pidieron en el período, hasta dónde llegaron (hasta hoy).'}
            {a.historicas > 0 && ` ${a.historicas} vinieron del sistema viejo: sus fechas por etapa son las de la solicitud.`}
            {panel.parametros.rango.desde <= REALIZADAS_SIN_DATO_HASTA && ' Hasta febrero de 2026 el sistema viejo no registraba la visita: las tasaciones realizadas y entregadas de esos meses faltan.'}
          </p>
        </div>
        <div className="inline-flex rounded-lg border p-0.5 text-xs">
          {(['eventos', 'cohorte'] as const).map(v => (
            <button key={v} onClick={() => onVista(v)} className={`px-2.5 py-1 rounded-md ${vista === v ? 'bg-muted font-medium' : 'text-muted-foreground'}`}>
              {v === 'eventos' ? 'Lo que pasó en el período' : 'Seguir a los que pidieron'}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b">
              <th className="text-left font-normal px-4 py-2">Paso</th>
              <th className="text-right font-normal px-3 py-2">Cantidad</th>
              <th className="text-right font-normal px-3 py-2">% del paso anterior</th>
              <th className="text-right font-normal px-3 py-2">% de las solicitudes</th>
              <th className="text-right font-normal px-3 py-2">Costo por cada uno</th>
              {panel.anterior && <th className="text-right font-normal px-4 py-2">Período comparado</th>}
            </tr>
          </thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.label} className="border-b last:border-0">
                <td className="px-4 py-2 whitespace-nowrap">{f.label} <DeDondeSale texto={f.ayuda} /></td>
                <td className="px-3 py-2 text-right tabular-n font-medium">{f.texto ?? (f.esPlata ? usd(f.valor) : num(f.valor))}</td>
                <td className="px-3 py-2 text-right tabular-n">{f.pctPaso === undefined ? '' : pct(f.pctPaso)}</td>
                <td className="px-3 py-2 text-right tabular-n text-muted-foreground">{f.pctSol == null ? '' : pct(f.pctSol)}</td>
                <td className="px-3 py-2 text-right tabular-n">{f.costo == null ? '' : usd(f.costo, f.costo < 100 ? 1 : 0)}</td>
                {panel.anterior && (
                  <td className="px-4 py-2 text-right tabular-n whitespace-nowrap">
                    {f.antes === undefined ? '' : <>{f.esPlata ? usd(f.antes) : num(f.antes)} <Variacion v={variacion(f.valor, f.antes)} bueno={f.esPlata ? 'baja' : 'sube'} /></>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
