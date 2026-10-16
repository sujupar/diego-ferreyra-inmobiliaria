/**
 * "Qué opinan los que visitaron" por propiedad (spec §3.4, §3.5, §4.5). Puro. Solo encuestas
 * TERMINADAS. La oferta mediana y su diferencia contra el precio publicado usan SOLO ofertas en la
 * misma moneda en que la propiedad está publicada hoy: mezclar pesos con dólares da cualquier cosa.
 */
import type { VisitaListado } from './tipos'
import { cifra, mediana, porcentaje, type Cifra } from './metricas'
import { etiquetaDeOpcion, OTRA } from './encuesta/opciones'
import type { Moneda } from './encuesta/tipos'

export interface ConteoEtiqueta { clave: string; etiqueta: string; cantidad: number }

export interface OpinionPropiedad {
  propertyId: string
  direccion: string
  respuestas: number
  /** % que dijo "Sí" sobre los que respondieron esa pregunta. */
  leGusto: Cifra
  precio: { correcto: number; alto: number; bajo: number }
  ofertaMediana: Cifra
  moneda: Moneda | null
  /** % de la oferta mediana contra el publicado (negativo = por debajo). */
  diferencia: Cifra
  masGusto: ConteoEtiqueta[]
  menosGusto: ConteoEtiqueta[]
  /** Lo que escribieron en "Otra cosa", más recientes primero, hasta 20. */
  comentarios: string[]
}

export const MAX_COMENTARIOS = 20

function contar(listas: string[][]): ConteoEtiqueta[] {
  const n = new Map<string, number>()
  for (const tags of listas) for (const t of tags) if (t !== OTRA) n.set(t, (n.get(t) ?? 0) + 1)
  return [...n.entries()]
    .map(([clave, cantidad]) => ({ clave, etiqueta: etiquetaDeOpcion(clave), cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || a.etiqueta.localeCompare(b.etiqueta, 'es'))
}

export function opinionesPorPropiedad(visitas: readonly VisitaListado[]): OpinionPropiedad[] {
  const grupos = new Map<string, VisitaListado[]>()
  for (const v of visitas) {
    if (!v.encuesta?.completed_at) continue
    const g = grupos.get(v.property_id) ?? []
    g.push(v)
    grupos.set(v.property_id, g)
  }
  const salida: OpinionPropiedad[] = []
  for (const [propertyId, g] of grupos) {
    const encuestas = g.flatMap(v => (v.encuesta ? [v.encuesta] : []))
    const conRespuesta = encuestas.filter(e => e.liked !== null)
    const moneda = g[0].moneda_publicada
    const precio = g[0].precio_publicado
    const ofertas = encuestas.filter(e => e.offer_amount !== null && moneda !== null && e.offer_currency === moneda).map(e => e.offer_amount ?? 0)
    const ofertaMediana = mediana(ofertas)
    const diferencia = ofertaMediana.valor !== null && precio !== null && precio > 0
      ? cifra(Math.round((ofertaMediana.valor / precio - 1) * 100), ofertaMediana.base)
      : cifra(0, 0)
    const comentarios = [...encuestas]
      .sort((a, b) => Date.parse(b.completed_at ?? '') - Date.parse(a.completed_at ?? ''))
      .flatMap(e => [
        ...(e.least_liked_other ? [`No le gustó: ${e.least_liked_other}`] : []),
        ...(e.most_liked_other ? [`Le gustó: ${e.most_liked_other}`] : []),
      ])
      .slice(0, MAX_COMENTARIOS)
    salida.push({
      propertyId,
      direccion: g[0].direccion?.trim() || 'Propiedad sin dirección',
      respuestas: encuestas.length,
      leGusto: porcentaje(conRespuesta.filter(e => e.liked === true).length, conRespuesta.length),
      precio: {
        correcto: encuestas.filter(e => e.price_opinion === 'correcto').length,
        alto: encuestas.filter(e => e.price_opinion === 'alto').length,
        bajo: encuestas.filter(e => e.price_opinion === 'bajo').length,
      },
      ofertaMediana,
      moneda,
      diferencia,
      masGusto: contar(encuestas.map(e => e.most_liked_tags)),
      menosGusto: contar(encuestas.map(e => e.least_liked_tags)),
      comentarios,
    })
  }
  return salida.sort((a, b) => b.respuestas - a.respuestas || a.direccion.localeCompare(b.direccion, 'es'))
}
