/**
 * Las partes PURAS de las fuentes: convierten lo que devuelven la base y las APIs en los datos del
 * informe. Separadas de la red para poder probarlas con respuestas reales copiadas.
 */
import { etiquetaDeOpcion } from '@/lib/visitas/encuesta/opciones'
import type { VisitaListado } from '@/lib/visitas/tipos'
import type { ConteoEtiqueta, DatosConsultas, DatosMeta, DatosVisitas, ReelInstagram } from '../tipos'
import { esPrueba, numero } from './comun'

// ─── Consultas ───────────────────────────────────────────────────────────────

export function contarConsultas(
  consultas: Array<{ portal: string | null; lead_name: string | null; lead_email: string | null }>,
  registros: Array<{ name: string | null; email: string | null }>,
): DatosConsultas {
  const porPortal = { zonaprop: 0, argenprop: 0, mercadolibre: 0, redes: 0, otros: 0 }
  for (const c of consultas) {
    if (esPrueba(c.lead_name, c.lead_email)) continue
    if (c.portal === 'zonaprop' || c.portal === 'argenprop' || c.portal === 'mercadolibre') porPortal[c.portal]++
    else porPortal.otros++
  }
  for (const r of registros) {
    if (!esPrueba(r.name, r.email)) porPortal.redes++
  }
  const total = Object.values(porPortal).reduce((a, b) => a + b, 0)
  return { total, porPortal }
}

// ─── Visitas y ficha de visitas ──────────────────────────────────────────────

function contar(claves: string[]): ConteoEtiqueta[] {
  const m = new Map<string, number>()
  for (const k of claves) m.set(k, (m.get(k) ?? 0) + 1)
  return [...m.entries()].map(([k, cantidad]) => ({ etiqueta: etiquetaDeOpcion(k), cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || a.etiqueta.localeCompare(b.etiqueta))
}

/**
 * Las visitas del período (ya filtradas por fecha). Realizadas = `completed`. La ficha cuenta solo
 * encuestas COMPLETAS de personas que no son de prueba; las ofertas, solo en la moneda de
 * publicación (una oferta en pesos contra un precio en dólares no se puede mostrar en la misma barra).
 */
export function fichaDeVisitas(visitas: VisitaListado[]): DatosVisitas {
  const reales = visitas.filter(v => !esPrueba(v.client_name, null))
  const realizadas = reales.filter(v => v.status === 'completed')
  const moneda = realizadas.find(v => v.moneda_publicada)?.moneda_publicada ?? null
  const ficha: DatosVisitas['ficha'] = {
    respuestas: 0, leGusto: { si: 0, no: 0 }, precio: { correcto: 0, alto: 0, bajo: 0 },
    ofertas: [], moneda, menosGusto: [], masGusto: [], comentariosMenosGusto: [],
  }
  const mas: string[] = []
  const menos: string[] = []
  for (const v of realizadas) {
    const e = v.encuesta
    if (!e?.completed_at) continue
    ficha.respuestas++
    if (e.liked === true) ficha.leGusto.si++
    if (e.liked === false) ficha.leGusto.no++
    if (e.price_opinion) ficha.precio[e.price_opinion]++
    if (e.offer_amount && e.offer_currency && e.offer_currency === moneda) ficha.ofertas.push(Number(e.offer_amount))
    mas.push(...e.most_liked_tags.filter(t => t !== 'otra'))
    menos.push(...e.least_liked_tags.filter(t => t !== 'otra'))
    if (e.least_liked_other?.trim()) ficha.comentariosMenosGusto.push(e.least_liked_other.trim())
  }
  ficha.ofertas.sort((a, b) => a - b)
  ficha.masGusto = contar(mas)
  ficha.menosGusto = contar(menos)
  return { realizadas: realizadas.length, ficha }
}

// ─── MercadoLibre ────────────────────────────────────────────────────────────

/** `GET /items/visits?ids=X&date_from&date_to` → `[{ item_id, total_visits }]`. */
export function visitasDeMercadoLibre(respuesta: unknown, avisoId: string): number {
  if (!Array.isArray(respuesta)) throw new Error('MercadoLibre devolvió una respuesta inesperada')
  const fila = respuesta.find(r => r && typeof r === 'object' && (r as Record<string, unknown>).item_id === avisoId) as Record<string, unknown> | undefined
  if (!fila) throw new Error(`MercadoLibre no devolvió las visitas del aviso ${avisoId}`)
  return numero(fila.total_visits)
}

export interface ContactosMercadoLibre { interesados: number; preguntas: number; whatsapp: number; llamadas: number; otros: number }

function canalDeContacto(lead: Record<string, unknown>): keyof Omit<ContactosMercadoLibre, 'interesados'> {
  const t = `${String(lead.contact_type ?? '')} ${String(lead.channel ?? '')}`.toLowerCase()
  if (t.includes('question')) return 'preguntas'
  if (t.includes('whatsapp')) return 'whatsapp'
  if (/\b(call|phone|llamada)\b/.test(t)) return 'llamadas'
  return 'otros'
}

/**
 * Páginas de `GET /vis/users/{id}/leads/buyers?item_id&date_from&date_to` → interesados (personas) y contactos
 * por canal. Medido con avisos reales (2026-10-22): cada resultado es un comprador con sus `leads`. Un canal que
 * no conocemos va a "otros" en vez de perderse. Si las páginas no suman el total que declara ML, es un error:
 * un conteo a medias frente al propietario es peor que un "no se pudo traer".
 */
export function contactosDeMercadoLibre(paginas: unknown[]): ContactosMercadoLibre {
  const r: ContactosMercadoLibre = { interesados: 0, preguntas: 0, whatsapp: 0, llamadas: 0, otros: 0 }
  let declarado: number | null = null
  for (const p of paginas) {
    const pag = p as { paging?: { total?: unknown }; results?: unknown }
    if (!pag || typeof pag !== 'object' || !Array.isArray(pag.results) || typeof pag.paging?.total !== 'number') {
      throw new Error('MercadoLibre devolvió una respuesta inesperada de interesados')
    }
    declarado = pag.paging.total
    for (const comprador of pag.results as Array<Record<string, unknown>>) {
      r.interesados++
      for (const lead of Array.isArray(comprador.leads) ? (comprador.leads as Array<Record<string, unknown>>) : []) r[canalDeContacto(lead)]++
    }
  }
  if (declarado !== null && r.interesados !== declarado) {
    throw new Error(`La lista de interesados de MercadoLibre vino incompleta (${r.interesados} de ${declarado})`)
  }
  return r
}

/**
 * `GET /items/{id}/contacts/phone_views/time_window?last=N&unit=day` → vistas del teléfono día por día. Se suman
 * solo los días del período (extremos incluidos). Si la ventana no llega al primer día, es un error.
 */
export function vistasDelTelefonoEnPeriodo(respuesta: unknown, desde: string, hasta: string): number {
  const resultados = (respuesta as { results?: unknown })?.results
  if (!Array.isArray(resultados)) throw new Error('MercadoLibre devolvió una respuesta inesperada de vistas del teléfono')
  const dias = resultados.map(x => ({ dia: String((x as Record<string, unknown>).date ?? '').slice(0, 10), total: numero((x as Record<string, unknown>).total) }))
  const primero = dias.map(d => d.dia).sort()[0]
  if (!primero || primero > desde) throw new Error('La ventana de vistas del teléfono de MercadoLibre no cubre todo el período')
  return dias.filter(d => d.dia >= desde && d.dia <= hasta).reduce((a, d) => a + d.total, 0)
}

// ─── Meta Ads ────────────────────────────────────────────────────────────────

type Accion = { action_type: string; value: string }
type FilaInsight = Record<string, unknown> & { actions?: Accion[] }

/** Lo mismo que cuenta como "resultado" en las campañas de propiedad (`parseLeadCount` del builder). */
const RESULTADOS = ['lead', 'onsite_web_lead', 'complete_registration', 'offsite_conversion.fb_pixel_lead',
  'offsite_conversion.fb_pixel_complete_registration', 'onsite_conversion.lead_grouped']

export function resultadosDe(actions: Accion[] | undefined): number {
  if (!actions) return 0
  for (const t of RESULTADOS) {
    const n = numero(actions.find(a => a.action_type === t)?.value)
    if (n > 0) return n
  }
  return 0
}

const PLATAFORMA: Record<string, string> = {
  facebook: 'Facebook', instagram: 'Instagram', audience_network: 'Audience Network', messenger: 'Messenger', threads: 'Threads', whatsapp: 'WhatsApp',
}
const RANGOS = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+']

/** Suma varias campañas de la misma propiedad: totales, por edad y sexo, por plataforma. */
export function sumarMeta(campanas: Array<{ total: FilaInsight[]; edadSexo: FilaInsight[]; plataformas: FilaInsight[] }>): DatosMeta {
  const d: DatosMeta = { campanas: 0, alcance: 0, impresiones: 0, resultados: 0, gasto: 0, edadSexo: [], plataformas: [] }
  const edad = new Map<string, { hombres: number; mujeres: number }>()
  const plat = new Map<string, { alcance: number; resultados: number }>()
  for (const c of campanas) {
    const t = c.total[0]
    if (!t) continue
    d.campanas++
    // El alcance de varias campañas no se puede sumar sin duplicar personas: es un tope por arriba.
    d.alcance += numero(t.reach)
    d.impresiones += numero(t.impressions)
    d.gasto += numero(t.spend)
    d.resultados += resultadosDe(t.actions)
    for (const f of c.edadSexo) {
      const rango = String(f.age ?? '')
      const e = edad.get(rango) ?? { hombres: 0, mujeres: 0 }
      if (f.gender === 'male') e.hombres += resultadosDe(f.actions)
      if (f.gender === 'female') e.mujeres += resultadosDe(f.actions)
      edad.set(rango, e)
    }
    for (const f of c.plataformas) {
      const nombre = PLATAFORMA[String(f.publisher_platform)] ?? String(f.publisher_platform)
      const p = plat.get(nombre) ?? { alcance: 0, resultados: 0 }
      p.alcance += numero(f.reach)
      p.resultados += resultadosDe(f.actions)
      plat.set(nombre, p)
    }
  }
  d.gasto = Math.round(d.gasto * 100) / 100
  d.edadSexo = RANGOS.map(rango => ({ rango, ...(edad.get(rango) ?? { hombres: 0, mujeres: 0 }) }))
  d.plataformas = [...plat.entries()].map(([plataforma, v]) => ({ plataforma, ...v })).sort((a, b) => b.alcance - a.alcance)
  return d
}

// ─── Instagram ───────────────────────────────────────────────────────────────

/** `GET /{media}/insights?metric=views,reach,likes,comments,saved,shares` → números del reel. */
export function reelDeInsights(respuesta: unknown, meta: { permalink: string | null; publicadoEn: string | null }): ReelInstagram {
  const data = (respuesta as { data?: Array<{ name: string; values?: Array<{ value: unknown }> }> })?.data
  if (!Array.isArray(data)) throw new Error('Instagram devolvió una respuesta inesperada')
  const v = (n: string) => numero(data.find(x => x.name === n)?.values?.[0]?.value)
  return {
    ...meta, reproducciones: v('views'), alcance: v('reach'), meGusta: v('likes'),
    comentarios: v('comments'), guardados: v('saved'), compartidos: v('shares'),
  }
}
