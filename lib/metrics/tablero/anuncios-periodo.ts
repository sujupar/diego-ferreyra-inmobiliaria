/**
 * Cada anuncio de la campaña de tasación en el PERÍODO elegido, para la tabla
 * "Anuncios activos" del Tablero. Módulo puro: recibe lo que devolvió Meta.
 *
 * Reglas (pedido del dueño, 2026-11-21):
 *  - Se muestran solo los anuncios ACTIVOS hoy; los apagados se resumen aparte
 *    (su gasto sigue contando en el total de la campaña).
 *  - Las versiones de un mismo anuncio (copias "-NEW 2", "VERSIÓN B", el mismo
 *    anuncio en otro conjunto) se suman en una sola fila: lo que se decide es el
 *    anuncio, no su copia.
 *  - Cada anuncio se puede ver con un clic: vista previa de Meta e Instagram.
 *    Los enlaces vienen de Meta y se validan por dominio EXACTO antes de mostrarse.
 */

export interface FilaInsightAnuncio {
  ad_id: string
  ad_name: string
  adset_name?: string
  /** Día de la fila (insights con time_increment=1), para pasar a USD con el blue de ese día. */
  date_start: string
  spend?: string
  impressions?: string
  inline_link_clicks?: string
  actions?: { action_type: string; value: string }[]
}

export interface FichaAnuncio {
  id: string
  effective_status: string
  conjunto: string | null
  preview_shareable_link?: string | null
  instagram_permalink_url?: string | null
  thumbnail_url?: string | null
  texto?: string | null
  titulo?: string | null
}

export interface AnuncioPeriodo {
  nombre: string
  activo: boolean
  /** Cuántos anuncios de Meta (versiones/conjuntos) se sumaron en esta fila. */
  versiones: number
  conjuntosActivos: string[]
  /** ARS. */
  gasto: number
  gastoUsd: number | null
  impresiones: number
  clics: number
  visitas: number
  registros: number
  costoPorRegistro: number | null
  costoPorRegistroUsd: number | null
  vistaPrevia: string | null
  instagram: string | null
  miniatura: string | null
  texto: string | null
  titulo: string | null
}

export interface TotalesAnuncios { gasto: number; gastoUsd: number | null; impresiones: number; clics: number; visitas: number; registros: number; costoPorRegistro: number | null; costoPorRegistroUsd: number | null }

const div = (a: number | null, b: number) => (a == null || !b ? null : a / b)
const num = (x: string | undefined) => Number(x ?? 0) || 0
const accion = (acts: FilaInsightAnuncio['actions'], tipo: string) => num(acts?.find(a => a.action_type === tipo)?.value)

/** Nombre del anuncio sin las marcas de versión que agregan las copias. */
export function nombreBaseAnuncio(nombre: string): string {
  let n = nombre.replace(/\s*\[.*$/, '').replace(/\s+/g, ' ').trim()
  // Las marcas se encadenan ("-NEW 1 - Copia", "VERSIÓN B - Copia 2"): se sacan
  // de a una desde el final hasta que no quede ninguna.
  for (let previo = ''; previo !== n;) {
    previo = n
    n = n.replace(/\s*-\s*(VERSI[ÓO]N\s+[A-Z]|NEW\s*\d+|Nuevo|Copia(\s*\d+)?)$/i, '').trim()
  }
  return n
}

const HOSTS: Record<'vista' | 'instagram' | 'imagen', (h: string) => boolean> = {
  vista: h => h === 'fb.me' || h === 'www.facebook.com' || h === 'business.facebook.com',
  instagram: h => h === 'www.instagram.com' || h === 'instagram.com',
  // Las miniaturas viven en subdominios de fbcdn.net: se compara el sufijo CON el punto.
  imagen: h => h === 'fbcdn.net' || h.endsWith('.fbcdn.net'),
}

/** El enlace si es https y de un dominio de Meta esperado; si no, null. */
export function enlaceDeMeta(url: string | null | undefined, tipo: keyof typeof HOSTS): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && HOSTS[tipo](u.hostname) ? u.toString() : null
  } catch {
    return null
  }
}

function totales(xs: AnuncioPeriodo[]): TotalesAnuncios {
  let gasto = 0, gastoUsd: number | null = 0, impresiones = 0, clics = 0, visitas = 0, registros = 0
  for (const x of xs) {
    gasto += x.gasto
    gastoUsd = gastoUsd == null || x.gastoUsd == null ? null : gastoUsd + x.gastoUsd
    impresiones += x.impresiones; clics += x.clics; visitas += x.visitas; registros += x.registros
  }
  return { gasto, gastoUsd, impresiones, clics, visitas, registros, costoPorRegistro: div(gasto, registros), costoPorRegistroUsd: div(gastoUsd, registros) }
}

/** Primero los que registraron (menor costo por registro arriba); después el resto, por gasto. */
const orden = (a: AnuncioPeriodo, b: AnuncioPeriodo) =>
  Number(b.registros > 0) - Number(a.registros > 0) || (a.costoPorRegistro ?? 0) - (b.costoPorRegistro ?? 0) || b.gasto - a.gasto

export function agruparAnunciosDelPeriodo(
  filas: FilaInsightAnuncio[],
  fichas: FichaAnuncio[],
  accionRegistro: string,
  blue: (fecha: string) => number | null,
) {
  const porId = new Map(fichas.map(f => [f.id, f]))
  const G = new Map<string, AnuncioPeriodo & { _ids: Set<string> }>()
  for (const f of filas) {
    const nombre = nombreBaseAnuncio(f.ad_name)
    const x = G.get(nombre) ?? {
      nombre, activo: false, versiones: 0, conjuntosActivos: [], gasto: 0, gastoUsd: 0, impresiones: 0, clics: 0, visitas: 0, registros: 0,
      costoPorRegistro: null, costoPorRegistroUsd: null, vistaPrevia: null, instagram: null, miniatura: null, texto: null, titulo: null, _ids: new Set<string>(),
    }
    const gasto = num(f.spend)
    x.gasto += gasto
    if (x.gastoUsd != null && gasto > 0) { const t = blue(f.date_start); x.gastoUsd = t ? x.gastoUsd + gasto / t : null }
    x.impresiones += num(f.impressions)
    x.clics += num(f.inline_link_clicks)
    x.visitas += accion(f.actions, 'landing_page_view')
    x.registros += accion(f.actions, accionRegistro)
    x._ids.add(f.ad_id)
    G.set(nombre, x)
  }
  const todos: AnuncioPeriodo[] = []
  for (const { _ids, ...x } of G.values()) {
    x.versiones = _ids.size
    const ficha = [..._ids].map(id => porId.get(id)).filter((y): y is FichaAnuncio => !!y)
    const activas = ficha.filter(y => y.effective_status === 'ACTIVE')
    x.activo = activas.length > 0
    x.conjuntosActivos = [...new Set(activas.map(y => y.conjunto).filter((c): c is string => !!c))]
    // El enlace y la imagen salen de la versión activa (o de cualquiera, si está apagado).
    const ref = activas[0] ?? ficha[0]
    if (ref) {
      x.vistaPrevia = enlaceDeMeta(ref.preview_shareable_link, 'vista')
      x.instagram = enlaceDeMeta(ref.instagram_permalink_url, 'instagram')
      x.miniatura = enlaceDeMeta(ref.thumbnail_url, 'imagen')
      x.texto = ref.texto?.slice(0, 600) ?? null
      x.titulo = ref.titulo?.slice(0, 120) ?? null
    }
    x.costoPorRegistro = div(x.gasto, x.registros)
    x.costoPorRegistroUsd = div(x.gastoUsd, x.registros)
    todos.push(x)
  }
  const activos = todos.filter(a => a.activo).sort(orden)
  const apagados = todos.filter(a => !a.activo).sort(orden)
  return { activos, apagados, totales: { activos: totales(activos), apagados: totales(apagados), campania: totales(todos) } }
}

export type AnunciosDelPeriodo = ReturnType<typeof agruparAnunciosDelPeriodo>
