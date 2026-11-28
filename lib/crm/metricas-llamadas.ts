// Estadísticas de las llamadas a las solicitudes de tasación (crm-estadisticas-llamadas, D1).
// Reglas puras: reciben las solicitudes ya elegidas (las del Tablero) y los intentos, y
// devuelven cantidades y minutos. No formatean: la pantalla usa `duracion` y `pct`.
import { minutosHabilesEntre } from './horario-laboral'

/**
 * Primera respuesta del código de `crm-ficha-y-llamadas` en producción: 26/11/2026 21:04:52
 * de Argentina. Lo anterior no se mide (no había dónde registrar las llamadas).
 */
export const INICIO_MEDICION_LLAMADAS = '2026-11-27T00:04:52.000Z'
export const POCOS_CASOS = 20

export const RESULTADOS_LLAMADA = ['no_atendio', 'agendo', 'volver_a_llamar', 'no_interesa', 'numero_equivocado'] as const
export type ResultadoLlamada = (typeof RESULTADOS_LLAMADA)[number]
/** Con estos resultados la persona atendió (contactada). "Número equivocado" no. */
const ATENDIO = new Set<string>(['agendo', 'volver_a_llamar', 'no_interesa'])

export interface SolicitudMedida {
  dealId: string
  contactId: string | null
  /** Instante de creación del proceso (ISO). */
  creadoEn: string
}

export interface IntentoMedido {
  id: string
  deal_id: string | null
  contact_id: string
  kind: string
  call_outcome: string | null
  occurred_at: string
  created_at: string
  voided_at: string | null
}

export interface Tiempo {
  /** Casos con dato. */
  n: number
  /** Casos sin dato (sin llamar, o sin segunda llamada). */
  sinCaso: number
  medianaReloj: number | null
  promedioReloj: number | null
  medianaHabiles: number | null
  promedioHabiles: number | null
}

export interface Reparto {
  n: number
  promedio: number | null
  reparto: { intento: '1' | '2' | '3' | '4 o más'; n: number }[]
}

export interface MetricasLlamadas {
  solicitudes: number
  /** Ni llamada ni WhatsApp marcado. */
  sinIntento: number
  /** Llamadas (sin WhatsApp) de estas solicitudes. */
  llamadas: number
  primeraLlamada: Tiempo
  primeraASegunda: Tiempo
  contactados: { n: number; de: number }
  agendados: { n: number; de: number }
  /** En qué llamada atendieron por primera vez (entre las contactadas). */
  intentosHastaAtender: Reparto
  /** En qué llamada agendaron (entre las que agendaron). */
  agendoEnLlamada: Reparto
  resultados: { resultado: ResultadoLlamada; n: number }[]
}

export function mediana(xs: readonly number[]): number | null {
  if (xs.length === 0) return null
  const o = [...xs].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}
const promedio = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/**
 * Los intentos de una solicitud: los ligados a su proceso, o los de su contacto desde que la
 * solicitud se creó. Sin anulados; por la hora en que ocurrieron y, a igual hora, por cuándo
 * se cargaron.
 */
export function intentosDeSolicitud(s: SolicitudMedida, intentos: readonly IntentoMedido[]): IntentoMedido[] {
  const desde = Date.parse(s.creadoEn)
  return intentos
    .filter((i) => !i.voided_at && (i.deal_id === s.dealId || (!!s.contactId && i.contact_id === s.contactId && Date.parse(i.occurred_at) >= desde)))
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at) || Date.parse(a.created_at) - Date.parse(b.created_at))
}

function tiempo(pares: { desde: string; hasta: string }[], sinCaso: number): Tiempo {
  const reloj = pares.map((p) => Math.max(0, (Date.parse(p.hasta) - Date.parse(p.desde)) / 60_000))
  const habiles = pares.map((p) => minutosHabilesEntre(new Date(p.desde), new Date(p.hasta)))
  return {
    n: pares.length, sinCaso,
    medianaReloj: mediana(reloj), promedioReloj: promedio(reloj),
    medianaHabiles: mediana(habiles), promedioHabiles: promedio(habiles),
  }
}

function reparto(numeros: number[]): Reparto {
  const cuenta = (f: (x: number) => boolean) => numeros.filter(f).length
  return {
    n: numeros.length,
    promedio: promedio(numeros),
    reparto: [
      { intento: '1', n: cuenta((x) => x === 1) },
      { intento: '2', n: cuenta((x) => x === 2) },
      { intento: '3', n: cuenta((x) => x === 3) },
      { intento: '4 o más', n: cuenta((x) => x >= 4) },
    ],
  }
}

export function metricasLlamadas(solicitudes: readonly SolicitudMedida[], intentos: readonly IntentoMedido[]): MetricasLlamadas {
  const aPrimera: { desde: string; hasta: string }[] = []
  const aSegunda: { desde: string; hasta: string }[] = []
  const atendio: number[] = []
  const agendo: number[] = []
  const porResultado = new Map<string, number>()
  let sinIntento = 0
  let llamadas = 0

  for (const s of solicitudes) {
    const suyos = intentosDeSolicitud(s, intentos)
    if (suyos.length === 0) sinIntento++
    const ls = suyos.filter((i) => i.kind === 'call')
    llamadas += ls.length
    for (const l of ls) if (l.call_outcome) porResultado.set(l.call_outcome, (porResultado.get(l.call_outcome) ?? 0) + 1)
    if (ls[0]) aPrimera.push({ desde: s.creadoEn, hasta: ls[0].occurred_at })
    if (ls[1]) aSegunda.push({ desde: ls[0].occurred_at, hasta: ls[1].occurred_at })
    const iAtendio = ls.findIndex((l) => ATENDIO.has(l.call_outcome ?? ''))
    if (iAtendio >= 0) atendio.push(iAtendio + 1)
    const iAgendo = ls.findIndex((l) => l.call_outcome === 'agendo')
    if (iAgendo >= 0) agendo.push(iAgendo + 1)
  }

  const de = solicitudes.length
  return {
    solicitudes: de,
    sinIntento,
    llamadas,
    primeraLlamada: tiempo(aPrimera, de - aPrimera.length),
    primeraASegunda: tiempo(aSegunda, aPrimera.length - aSegunda.length),
    contactados: { n: atendio.length, de },
    agendados: { n: agendo.length, de },
    intentosHastaAtender: reparto(atendio),
    agendoEnLlamada: reparto(agendo),
    resultados: RESULTADOS_LLAMADA.map((resultado) => ({ resultado, n: porResultado.get(resultado) ?? 0 })),
  }
}
