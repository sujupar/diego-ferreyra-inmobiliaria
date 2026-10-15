/**
 * Lo que muestra la sección Visitas (spec §3.4), armado a partir de las filas que leyó
 * la ruta: agenda de los próximos días, "requieren tu acción" y métricas del período.
 * Puro; las decisiones de alcance (qué filas entran) ya las tomó la ruta.
 */
import type { VisitaListado } from './tipos'
import { calcularMetricas, type Metricas } from './metricas'
import { ESTADOS_ACTIVOS } from './transiciones'
import { fechaEnArgentina, diasParaElegir } from './horario'

export const DIAS_DE_AGENDA = 7
export const MAX_POR_LISTA = 50

export interface DiaDeAgenda {
  fecha: string
  etiqueta: string
  visitas: VisitaListado[]
}

export interface RequierenAccion {
  sinResultado: VisitaListado[]
  aConfirmar: VisitaListado[]
  /** Total REAL (las listas se cortan en MAX_POR_LISTA). */
  total: number
}

export interface ResumenVisitas {
  periodo: { desde: string; hasta: string }
  hoy: string
  visitasHoy: number
  metricas: Metricas
  agenda: DiaDeAgenda[]
  requieren: RequierenAccion
  propiedades: Array<{ id: string; direccion: string }>
  /** Se llegó al techo de filas leídas: los números pueden estar incompletos y la pantalla lo dice. */
  truncado: boolean
}

function porHorario(a: VisitaListado, b: VisitaListado): number {
  return Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at) || a.id.localeCompare(b.id)
}

export function armarAgenda(visitas: readonly VisitaListado[], hoy: string): DiaDeAgenda[] {
  const porDia = new Map<string, VisitaListado[]>()
  for (const v of visitas) {
    const dia = fechaEnArgentina(new Date(v.scheduled_at))
    const lista = porDia.get(dia) ?? []
    lista.push(v)
    porDia.set(dia, lista)
  }
  return diasParaElegir(hoy, DIAS_DE_AGENDA)
    .map((d, i) => ({
      fecha: d.fecha,
      etiqueta: i < 2 ? d.etiqueta : `${d.etiqueta} ${d.numero}`,
      visitas: (porDia.get(d.fecha) ?? []).sort(porHorario),
    }))
    .filter((d, i) => i === 0 || d.visitas.length > 0)
}

export function requierenAccion(abiertas: readonly VisitaListado[], ahora: Date): RequierenAccion {
  const t = ahora.getTime()
  const activas = abiertas.filter(v => ESTADOS_ACTIVOS.includes(v.status))
  const sinResultado = activas.filter(v => Date.parse(v.scheduled_at) < t).sort((a, b) => porHorario(b, a))
  const aConfirmar = activas
    .filter(v => v.status === 'pending_confirmation' && Date.parse(v.scheduled_at) >= t)
    .sort(porHorario)
  return {
    sinResultado: sinResultado.slice(0, MAX_POR_LISTA),
    aConfirmar: aConfirmar.slice(0, MAX_POR_LISTA),
    total: sinResultado.length + aConfirmar.length,
  }
}

export interface EntradaResumen {
  periodo: { desde: string; hasta: string }
  delPeriodo: readonly VisitaListado[]
  abiertas: readonly VisitaListado[]
  proximas: readonly VisitaListado[]
  ahora: Date
  truncado: boolean
  verTodo: boolean
}

export function armarResumen(e: EntradaResumen): ResumenVisitas {
  const hoy = fechaEnArgentina(e.ahora)
  const metricas = calcularMetricas(e.delPeriodo, e.ahora)
  const agenda = armarAgenda(e.proximas, hoy)
  const propiedades = new Map<string, string>()
  for (const v of [...e.delPeriodo, ...e.abiertas, ...e.proximas]) {
    if (!propiedades.has(v.property_id)) propiedades.set(v.property_id, v.direccion?.trim() || 'Propiedad sin dirección')
  }
  return {
    periodo: e.periodo,
    hoy,
    visitasHoy: agenda[0].visitas.filter(v => v.status !== 'cancelled').length,
    metricas: e.verTodo ? metricas : { ...metricas, porAsesor: [] },
    agenda,
    requieren: requierenAccion(e.abiertas, e.ahora),
    propiedades: [...propiedades.entries()]
      .map(([id, direccion]) => ({ id, direccion }))
      .sort((a, b) => a.direccion.localeCompare(b.direccion, 'es')),
    truncado: e.truncado,
  }
}
