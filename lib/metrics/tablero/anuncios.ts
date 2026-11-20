/**
 * Franja "Anuncios" del Tablero. Módulo puro: recibe las filas de
 * `meta_ads_daily` ya bajadas (MetaDia, gasto en ARS) y arma los números.
 *
 * Registros:
 *  - Tasación y clase: el evento del píxel CompleteRegistration (lo que optimizan
 *    los conjuntos de Meta), de `raw_data->actions`.
 *  - Campañas de propiedades: el píxel NO dispara en la ficha pública; el registro
 *    real es una fila de `property_leads` que vino de Meta. Se une campaña →
 *    propiedad por `property_meta_campaigns.campaign_id`.
 */

import { embudoDeCampania, type EmbudoCampania, type MetaDia } from '../panel/embudo'
import { enRango, sumarDias, type Rango } from '../panel/rango'

const div = (a: number, b: number) => (b ? a / b : null)

export interface TotalAnuncios {
  /** ARS. */
  gasto: number
  /** Visitas a la página que mide Meta (landing_page_view). */
  visitas: number
  registros: number
  costoPorRegistro: number | null
  /** Días del rango con fila en `meta_ads_daily` (si es 0, el período no tiene dato). */
  diasConDato: number
}

/** Totales de un tipo de campaña en el rango. null si Meta no tiene NINGUNA fila en ese rango (sin dato, no $0). */
export function totalAnuncios(meta: MetaDia[], r: Rango, tipo: EmbudoCampania): TotalAnuncios | null {
  let gasto = 0, visitas = 0, registros = 0
  const dias = new Set<string>()
  for (const m of meta) {
    if (!enRango(m.fecha, r) || embudoDeCampania(m.campania) !== tipo) continue
    dias.add(m.fecha)
    gasto += m.gasto
    visitas += m.visitasMeta
    registros += m.registros ?? 0
  }
  if (dias.size === 0) return null
  return { gasto, visitas, registros, costoPorRegistro: div(gasto, registros), diasConDato: dias.size }
}

export interface FilaCampania {
  campaniaId: string
  nombre: string
  tipo: EmbudoCampania
  propiedadId: string | null
  gasto: number
  visitas: number
  /** null = no hay de dónde sacarlo (campaña de propiedad sin propiedad vinculada). */
  registros: number | null
  fuenteRegistros: 'pixel' | 'pagina' | null
  costoPorRegistro: number | null
}

export interface EnlaceCampania { propiedadId: string; nombre: string | null }

const ORDEN_TIPO: Record<EmbudoCampania, number> = { tasacion: 0, clase: 1, propiedad: 2 }

/**
 * Una fila por campaña con gasto o visitas en el rango: tasación, clase y cada
 * propiedad (las de propiedades, de mayor a menor gasto).
 */
export function porCampania(
  meta: MetaDia[],
  r: Rango,
  enlaces: Map<string, EnlaceCampania>,
  registrosMetaPorPropiedad: Map<string, number>,
): FilaCampania[] {
  const M = new Map<string, { nombre: string; ultima: string; gasto: number; visitas: number; registros: number }>()
  for (const m of meta) {
    if (!enRango(m.fecha, r)) continue
    const id = m.campaniaId || m.campania
    const x = M.get(id) ?? { nombre: m.campania, ultima: m.fecha, gasto: 0, visitas: 0, registros: 0 }
    if (m.fecha >= x.ultima) { x.ultima = m.fecha; x.nombre = m.campania }
    x.gasto += m.gasto
    x.visitas += m.visitasMeta
    x.registros += m.registros ?? 0
    M.set(id, x)
  }
  const filas: FilaCampania[] = []
  for (const [id, x] of M) {
    if (x.gasto === 0 && x.visitas === 0) continue
    const tipo = embudoDeCampania(x.nombre)
    if (tipo !== 'propiedad') {
      filas.push({ campaniaId: id, nombre: x.nombre, tipo, propiedadId: null, gasto: x.gasto, visitas: x.visitas, registros: x.registros, fuenteRegistros: 'pixel', costoPorRegistro: div(x.gasto, x.registros) })
      continue
    }
    const enlace = enlaces.get(id)
    const registros = enlace ? registrosMetaPorPropiedad.get(enlace.propiedadId) ?? 0 : null
    filas.push({
      campaniaId: id,
      nombre: enlace?.nombre ?? x.nombre,
      tipo,
      propiedadId: enlace?.propiedadId ?? null,
      gasto: x.gasto,
      visitas: x.visitas,
      registros,
      fuenteRegistros: enlace ? 'pagina' : null,
      costoPorRegistro: registros == null ? null : div(x.gasto, registros),
    })
  }
  return filas.sort((a, b) => ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo] || b.gasto - a.gasto)
}

// ---------------------------------------------------------------------------
// Ajustes de campaña (hitos): antes y después.
// ---------------------------------------------------------------------------

export interface HitoAjuste {
  id: string
  fecha: string
  embudo: 'tasacion' | 'clase' | null
  titulo: string
  detalle: string | null
  resultado_buscado?: string | null
  meta_costo_registro_ars?: number | null
  fecha_decision?: string | null
}

export interface Tramo extends Rango {
  dias: number
  gasto: number | null
  registros: number | null
  costoPorRegistro: number | null
}

export interface AjusteCalculado {
  id: string
  fecha: string
  embudo: 'tasacion' | 'clase'
  titulo: string
  detalle: string | null
  resultadoBuscado: string | null
  metaCostoRegistroArs: number | null
  fechaDecision: string | null
  antes: Tramo | null
  despues: Tramo | null
}

/**
 * Tramos de comparación de un ajuste hecho el día `fecha`.
 *
 * REGLA: `meta_ads_daily` tiene una fila por DÍA, así que el día del ajuste
 * mezcla las dos estructuras y no entra en ninguno de los dos lados.
 *  - Antes: del 1 del mes del día previo al ajuste (o del día siguiente al ajuste
 *    anterior, si es más tarde) hasta el día previo. 19/11 → 1 al 18/11.
 *  - Después: del día siguiente al ajuste hasta hoy. 19/11 → 20/11 en adelante.
 */
export function tramosDeAjuste(fecha: string, hoy: string, ajusteAnterior: string | null): { antes: Rango | null; despues: Rango | null } {
  const finAntes = sumarDias(fecha, -1)
  let desdeAntes = finAntes.slice(0, 8) + '01'
  if (ajusteAnterior && sumarDias(ajusteAnterior, 1) > desdeAntes) desdeAntes = sumarDias(ajusteAnterior, 1)
  const desdeDespues = sumarDias(fecha, 1)
  return {
    antes: desdeAntes <= finAntes ? { desde: desdeAntes, hasta: finAntes } : null,
    despues: desdeDespues <= hoy ? { desde: desdeDespues, hasta: hoy } : null,
  }
}

function tramo(meta: MetaDia[], r: Rango | null, tipo: 'tasacion' | 'clase', datosDesde: string): Tramo | null {
  if (!r) return null
  const dias = Math.round((Date.parse(r.hasta) - Date.parse(r.desde)) / 86_400_000) + 1
  // Si el tramo arranca antes de lo que se bajó de Meta, el número saldría corto: sin dato.
  if (r.desde < datosDesde) return { ...r, dias, gasto: null, registros: null, costoPorRegistro: null }
  const t = totalAnuncios(meta, r, tipo)
  return { ...r, dias, gasto: t?.gasto ?? null, registros: t?.registros ?? null, costoPorRegistro: t?.costoPorRegistro ?? null }
}

/**
 * Cada ajuste cargado, con el costo por registro antes y después. Un ajuste sin
 * embudo ("los dos") se mide contra tasación, que es la campaña principal.
 * Más reciente primero.
 */
export function calcularAjustes(hitos: HitoAjuste[], meta: MetaDia[], hoy: string, datosDesde: string): AjusteCalculado[] {
  const orden = [...hitos].filter(h => h.fecha <= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha))
  const out: AjusteCalculado[] = []
  orden.forEach((h, i) => {
    const embudo = h.embudo ?? 'tasacion'
    const previo = orden.slice(0, i).reverse().find(x => (x.embudo ?? 'tasacion') === embudo && x.fecha < h.fecha)
    const t = tramosDeAjuste(h.fecha, hoy, previo?.fecha ?? null)
    out.push({
      id: h.id,
      fecha: h.fecha,
      embudo,
      titulo: h.titulo,
      detalle: h.detalle,
      resultadoBuscado: h.resultado_buscado ?? null,
      metaCostoRegistroArs: h.meta_costo_registro_ars ?? null,
      fechaDecision: h.fecha_decision ?? null,
      antes: tramo(meta, t.antes, embudo, datosDesde),
      despues: tramo(meta, t.despues, embudo, datosDesde),
    })
  })
  return out.reverse()
}

// ---------------------------------------------------------------------------
// Anuncios de la estructura actual (Meta en vivo).
// ---------------------------------------------------------------------------

export interface ConjuntoRaw { id: string; name: string; effective_status: string }
export interface AnuncioRaw {
  id: string
  name: string
  effective_status: string
  insights?: { data?: { spend?: string; actions?: { action_type: string; value: string }[] }[] }
}

export interface AnuncioVivo {
  conjuntoId: string
  conjunto: string
  id: string
  nombre: string
  estado: string
  /** ARS, desde que existe el anuncio. */
  gasto: number
  visitas: number
  registros: number
  costoPorRegistro: number | null
}

const accion = (acts: { action_type: string; value: string }[] | undefined, tipo: string) =>
  Number(acts?.find(a => a.action_type === tipo)?.value ?? 0) || 0

/** Aplana conjuntos ACTIVOS → anuncios con su gasto, visitas y registros de toda la vida. */
export function armarAnunciosVivo(conjuntos: ConjuntoRaw[], anuncios: Record<string, AnuncioRaw[]>, accionRegistro: string): AnuncioVivo[] {
  const out: AnuncioVivo[] = []
  for (const c of conjuntos) {
    if (c.effective_status !== 'ACTIVE') continue
    for (const a of anuncios[c.id] ?? []) {
      const ins = a.insights?.data?.[0]
      const gasto = Number(ins?.spend ?? 0) || 0
      const registros = accion(ins?.actions, accionRegistro)
      out.push({
        conjuntoId: c.id, conjunto: c.name, id: a.id, nombre: a.name, estado: a.effective_status,
        gasto, visitas: accion(ins?.actions, 'landing_page_view'), registros, costoPorRegistro: div(gasto, registros),
      })
    }
  }
  // Activos primero; dentro de cada conjunto, el que más gastó arriba.
  const activo = (x: AnuncioVivo) => (x.estado === 'ACTIVE' ? 0 : 1)
  return out.sort((a, b) => a.conjunto.localeCompare(b.conjunto) || activo(a) - activo(b) || b.gasto - a.gasto)
}

/**
 * La campaña de tasación vigente: la última campaña con "tasaci" en el nombre que
 * tuvo gasto en `meta_ads_daily`. Así no se hardcodea el id.
 */
export function campaniaTasacionVigente(meta: MetaDia[]): string | null {
  let mejor: MetaDia | null = null
  for (const m of meta) {
    if (embudoDeCampania(m.campania) !== 'tasacion' || !m.campaniaId || m.gasto <= 0) continue
    if (!mejor || m.fecha > mejor.fecha) mejor = m
  }
  return mejor?.campaniaId ?? null
}
