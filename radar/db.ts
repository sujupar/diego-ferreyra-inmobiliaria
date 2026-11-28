// Cliente de Supabase del radar (service role) y todas las lecturas/escrituras de la corrida.
// Lee el entorno del proceso: el radar real carga ~/.radar-referencias/.env; en desarrollo,
// `--env-file=.env.local`.
//
// Cada función recibe el cliente como último parámetro (por defecto el real) para poder
// probarla con un doble.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ConfigRadar, CuentaPerfil, MedicionCuenta } from './tipos'

let cliente: SupabaseClient | null = null

export function supabaseAdmin(): SupabaseClient {
  if (cliente) return cliente
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno del radar')
  }
  cliente = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return cliente
}

const sb0 = () => supabaseAdmin()
/** Las listas `in (...)` van por lotes: una URL con 300 shortcodes se pasa de largo. */
const LOTE = 100

function lotes<T>(xs: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += LOTE) out.push(xs.slice(i, i + LOTE))
  return out
}

function falla(que: string, error: { message: string } | null): void {
  if (error) throw new Error(`${que}: ${error.message}`)
}

const sinArroba = (u: string) => u.replace(/^@/, '').trim().toLowerCase()

// ---------- helpers puros (probados en db.test.ts) ----------

const fmtDiaBA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Día calendario en Buenos Aires (AAAA-MM-DD). "Hoy" del radar es siempre el de acá. */
export function diaBA(d: Date): string {
  return fmtDiaBA.format(d)
}

const CLAVES_CONFIG: Record<keyof ConfigRadar, string> = {
  multiplicadorMin: 'multiplicador_min',
  diasMax: 'dias_max',
  vistasMin: 'vistas_min',
  reelsBase: 'reels_base',
  diasMaduro: 'dias_maduro',
  puntajeMin: 'puntaje_min',
  topeDiario: 'tope_diario',
  topeCuentas: 'tope_cuentas',
  topeReels: 'tope_reels',
}

/** Arma la config desde las filas de `radar_config`. Falta una clave o no es número → error (nunca un default mudo). */
export function configDesdeFilas(filas: Array<{ clave: string; valor: unknown }>): ConfigRadar {
  const mapa = new Map(filas.map((f) => [f.clave, f.valor]))
  const cfg = {} as ConfigRadar
  for (const [campo, clave] of Object.entries(CLAVES_CONFIG) as Array<[keyof ConfigRadar, string]>) {
    const v = Number(mapa.get(clave))
    if (!mapa.has(clave) || !Number.isFinite(v)) throw new Error(`radar_config: falta o no es número la clave "${clave}"`)
    cfg[campo] = v
  }
  return cfg
}

export type OrigenCuenta = 'semilla' | 'busqueda' | 'explorar'

export interface CuentaARevisar {
  usuario: string
  origen: OrigenCuenta | null
  rubro: 'inmobiliario' | 'otro' | null
  vecesRevisada: number
  destacados: number
  ultimaRevisionAt: string | null
  /** Alta en radar_cuentas: desempata las nunca revisadas por orden de llegada (FIFO). */
  creadaAt: string | null
}

/**
 * Semillas primero, después las inmobiliarias, y dentro de cada grupo la revisada hace más
 * tiempo (nunca = primera). Empate (p. ej. dos nunca revisadas): la que llegó antes. NUNCA por
 * nombre: eso dejaba sin turno para siempre a las cuentas del final del alfabeto.
 * Es el mismo orden que arma la consulta de `cuentasParaRevisar` (acá, para las pruebas y el seco).
 */
export function ordenarCuentas(cuentas: CuentaARevisar[]): CuentaARevisar[] {
  const grupo = (c: CuentaARevisar) => (c.origen === 'semilla' ? 0 : c.rubro === 'inmobiliario' ? 1 : 2)
  const t = (x: string | null) => (x ? new Date(x).getTime() : -Infinity)
  return [...cuentas].sort(
    (a, b) => grupo(a) - grupo(b) || t(a.ultimaRevisionAt) - t(b.ultimaRevisionAt) || t(a.creadaAt) - t(b.creadaAt),
  )
}

/** Rotación de búsquedas: `n` términos desde el cursor, dando la vuelta. Devuelve el cursor siguiente. */
export function rotarBusquedas(terminos: string[], cursor: number, n: number): { elegidos: string[]; siguiente: number } {
  if (terminos.length === 0) return { elegidos: [], siguiente: 0 }
  const inicio = ((Math.trunc(cursor) % terminos.length) + terminos.length) % terminos.length
  const k = Math.min(n, terminos.length)
  const elegidos = Array.from({ length: k }, (_, i) => terminos[(inicio + i) % terminos.length])
  return { elegidos, siguiente: (inicio + k) % terminos.length }
}

/** Lo único que se refresca de una referencia que ya existe: jamás el estado, el guion ni el análisis. */
export const COLUMNAS_METRICAS = ['vistas', 'likes', 'comentarios', 'multiplicador', 'baseline_cuenta', 'seguidores'] as const

export function soloMetricas(fila: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const c of COLUMNAS_METRICAS) if (c in fila) out[c] = fila[c]
  out.updated_at = new Date().toISOString()
  return out
}

// ---------- config y corridas ----------

export async function leerConfig(sb: SupabaseClient = sb0()): Promise<ConfigRadar> {
  const { data, error } = await sb.from('radar_config').select('clave, valor')
  falla('no se pudo leer radar_config', error)
  return configDesdeFilas((data ?? []) as Array<{ clave: string; valor: unknown }>)
}

export async function crearCorrida(version: string, sb: SupabaseClient = sb0()): Promise<string> {
  const { data, error } = await sb.from('radar_corridas').insert({ estado: 'corriendo', version }).select('id').single()
  falla('no se pudo crear la corrida', error)
  return (data as { id: string }).id
}

export interface Contadores {
  cuentas_revisadas: number
  reels_mirados: number
  candidatos: number
  publicadas: number
}

export async function cerrarCorrida(
  id: string,
  estado: 'ok' | 'parcial' | 'frenada_por_instagram' | 'error',
  paso: string | null,
  contadores: Contadores,
  mensaje: string | null,
  sb: SupabaseClient = sb0(),
): Promise<void> {
  const { error } = await sb
    .from('radar_corridas')
    .update({ estado, paso, ...contadores, mensaje: mensaje?.slice(0, 2000) ?? null, fin: new Date().toISOString() })
    .eq('id', id)
  falla('no se pudo cerrar la corrida', error)
}

/** ¿Ya hubo hoy (día de Buenos Aires) una corrida que terminó bien o a medias? */
export async function yaCorrioHoy(ahora: Date = new Date(), sb: SupabaseClient = sb0()): Promise<boolean> {
  const { data, error } = await sb
    .from('radar_corridas')
    .select('inicio')
    .in('estado', ['ok', 'parcial'])
    .order('inicio', { ascending: false })
    .limit(1)
  falla('no se pudo leer radar_corridas', error)
  const ultima = (data ?? [])[0] as { inicio: string } | undefined
  return !!ultima && diaBA(new Date(ultima.inicio)) === diaBA(ahora)
}

// ---------- cuentas ----------

/**
 * Activas y con menos de 3 descartes a mano, en el orden de revisión, hasta `tope`.
 * El orden y el límite van EN LA CONSULTA (no en JS): PostgREST corta en 1000 filas, y
 * ordenar en memoria sobre un subconjunto arbitrario dejaba afuera semillas e inmobiliarias.
 * Tres consultas ordenadas, una por grupo (semilla → inmobiliario → otro), llenando el tope.
 */
export async function cuentasParaRevisar(tope: number, sb: SupabaseClient = sb0()): Promise<CuentaARevisar[]> {
  const NO_SEMILLA = 'origen.is.null,origen.neq.semilla'
  const grupos: Array<(q: any) => any> = [ // eslint-disable-line @typescript-eslint/no-explicit-any
    (q) => q.eq('origen', 'semilla'),
    (q) => q.eq('rubro', 'inmobiliario').or(NO_SEMILLA),
    (q) => q.or('rubro.is.null,rubro.neq.inmobiliario').or(NO_SEMILLA),
  ]
  const out: CuentaARevisar[] = []
  for (const filtrar of grupos) {
    const resta = tope - out.length
    if (resta <= 0) break
    const base = sb
      .from('radar_cuentas')
      .select('usuario, origen, rubro, veces_revisada, destacados, ultima_revision_at, created_at')
      .eq('activa', true)
      .lt('descartes_manuales', 3)
    const { data, error } = await filtrar(base)
      .order('ultima_revision_at', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true })
      .limit(resta)
    falla('no se pudo leer radar_cuentas', error)
    for (const f of (data ?? []) as Array<{
      usuario: string
      origen: OrigenCuenta | null
      rubro: 'inmobiliario' | 'otro' | null
      veces_revisada: number | null
      destacados: number | null
      ultima_revision_at: string | null
      created_at: string | null
    }>) {
      if (out.some((c) => c.usuario === f.usuario)) continue
      out.push({
        usuario: f.usuario,
        origen: f.origen,
        rubro: f.rubro,
        vecesRevisada: f.veces_revisada ?? 0,
        destacados: f.destacados ?? 0,
        ultimaRevisionAt: f.ultima_revision_at,
        creadaAt: f.created_at,
      })
    }
  }
  return out.slice(0, tope)
}

/** De estos usuarios, cuáles ya están en `radar_cuentas` (activos o no: una desactivada no se re-descubre). */
export async function cuentasConocidas(usuarios: string[], sb: SupabaseClient = sb0()): Promise<Set<string>> {
  const out = new Set<string>()
  for (const lote of lotes([...new Set(usuarios.map(sinArroba))])) {
    const { data, error } = await sb.from('radar_cuentas').select('usuario').in('usuario', lote)
    falla('no se pudo leer radar_cuentas', error)
    for (const f of (data ?? []) as Array<{ usuario: string }>) out.add(f.usuario)
  }
  return out
}

/** Registra cuentas descubiertas. Rubro `otro` hasta que la IA clasifique uno de sus reels como inmobiliario. */
export async function registrarCuentas(usuarios: string[], origen: OrigenCuenta, sb: SupabaseClient = sb0()): Promise<void> {
  const filas = [...new Set(usuarios.map(sinArroba))].filter(Boolean).map((usuario) => ({
    usuario,
    origen,
    rubro: origen === 'semilla' ? 'inmobiliario' : 'otro',
  }))
  if (filas.length === 0) return
  const { error } = await sb.from('radar_cuentas').upsert(filas, { onConflict: 'usuario', ignoreDuplicates: true })
  falla('no se pudieron registrar cuentas', error)
}

export interface EstadoCuenta {
  vecesRevisada: number
  destacados: number
  activa: boolean
}

export async function actualizarCuenta(
  usuario: string,
  perfil: CuentaPerfil,
  medicion: MedicionCuenta,
  estado: EstadoCuenta,
  sb: SupabaseClient = sb0(),
): Promise<void> {
  const ahora = new Date().toISOString()
  const patch: Record<string, unknown> = {
    ig_user_id: perfil.igUserId,
    seguidores: perfil.seguidores,
    veces_revisada: estado.vecesRevisada,
    destacados: estado.destacados,
    ultima_revision_at: ahora,
    activa: estado.activa,
  }
  // Una base insuficiente no pisa la última que sí sirvió.
  if (medicion.base != null) {
    patch.base_vistas = Math.round(medicion.base)
    patch.base_n = medicion.baseN
    patch.base_medida_at = ahora
  }
  const { error } = await sb.from('radar_cuentas').update(patch).eq('usuario', sinArroba(usuario))
  falla(`no se pudo actualizar @${usuario}`, error)
}

export async function marcarCuentaInmobiliaria(usuario: string, sb: SupabaseClient = sb0()): Promise<void> {
  const { error } = await sb.from('radar_cuentas').update({ rubro: 'inmobiliario' }).eq('usuario', sinArroba(usuario))
  falla(`no se pudo marcar @${usuario} como inmobiliaria`, error)
}

// ---------- búsquedas ----------

/** Los términos de hoy, rotando. Con `avanzar=false` (corrida en seco) no se mueve el cursor. */
export async function busquedasDeHoy(n: number, avanzar: boolean, sb: SupabaseClient = sb0()): Promise<string[]> {
  const { data, error } = await sb.from('radar_busquedas').select('termino').eq('activo', true).order('termino')
  falla('no se pudo leer radar_busquedas', error)
  const terminos = ((data ?? []) as Array<{ termino: string }>).map((f) => f.termino)
  const { data: c, error: e2 } = await sb.from('radar_config').select('valor').eq('clave', 'busquedas_cursor').maybeSingle()
  falla('no se pudo leer el cursor de búsquedas', e2)
  const cursor = Number((c as { valor?: unknown } | null)?.valor ?? 0) || 0
  const { elegidos, siguiente } = rotarBusquedas(terminos, cursor, n)
  if (avanzar && terminos.length > 0) {
    const { error: e3 } = await sb.from('radar_config').upsert({ clave: 'busquedas_cursor', valor: siguiente }, { onConflict: 'clave' })
    falla('no se pudo guardar el cursor de búsquedas', e3)
  }
  return elegidos
}

// ---------- vistos ----------

export async function vistos(shortcodes: string[], sb: SupabaseClient = sb0()): Promise<Set<string>> {
  const out = new Set<string>()
  for (const lote of lotes([...new Set(shortcodes)])) {
    const { data, error } = await sb.from('radar_vistos').select('ig_shortcode').in('ig_shortcode', lote)
    falla('no se pudo leer radar_vistos', error)
    for (const f of (data ?? []) as Array<{ ig_shortcode: string }>) out.add(f.ig_shortcode)
  }
  return out
}

export type ResultadoVisto = 'publicado' | 'descartado_relevancia' | 'bajo_umbral' | 'error'

export async function marcarVisto(
  v: { shortcode: string; cuenta: string; multiplicador: number | null; resultado: ResultadoVisto; motivo: string | null; runId: string },
  sb: SupabaseClient = sb0(),
): Promise<void> {
  const { error } = await sb.from('radar_vistos').upsert(
    {
      ig_shortcode: v.shortcode,
      cuenta: sinArroba(v.cuenta),
      multiplicador: v.multiplicador == null ? null : Math.round(v.multiplicador * 100) / 100,
      resultado: v.resultado,
      motivo: v.motivo?.slice(0, 500) ?? null,
      run_id: v.runId,
      visto_at: new Date().toISOString(),
    },
    { onConflict: 'ig_shortcode' },
  )
  falla(`no se pudo marcar ${v.shortcode} como visto`, error)
}

// ---------- video_refs ----------

/** Publicadas por el radar en los últimos 7 días, separadas para la regla 80/20. */
export async function semanaPublicada(ahora: Date = new Date(), sb: SupabaseClient = sb0()): Promise<{ inmobiliarias: number; otras: number }> {
  const desde = new Date(ahora.getTime() - 7 * 86_400_000).toISOString()
  const contar = async (categorias: string[]) => {
    const { count, error } = await sb
      .from('video_refs')
      .select('id', { count: 'exact', head: true })
      .eq('fuente', 'radar')
      .gte('created_at', desde)
      .in('categoria', categorias)
    falla('no se pudo contar la semana publicada', error)
    return count ?? 0
  }
  return {
    inmobiliarias: await contar(['inmobiliario_ar', 'inmobiliario_otro_pais']),
    otras: await contar(['formato_otro_rubro']),
  }
}

/** Las últimas descartadas a mano ("No sirve"), como ejemplos para el filtro. */
export async function ejemplosNoSirve(n = 20, sb: SupabaseClient = sb0()): Promise<string[]> {
  const { data, error } = await sb
    .from('video_refs')
    .select('tema, no_sirve_motivo')
    .not('no_sirve_at', 'is', null)
    .order('no_sirve_at', { ascending: false })
    .limit(n)
  falla('no se pudieron leer los ejemplos de "No sirve"', error)
  return ((data ?? []) as Array<{ tema: string | null; no_sirve_motivo: string | null }>).map(
    (f) => `${f.tema ?? '(sin tema)'} — ${f.no_sirve_motivo?.trim() || 'sin motivo'}`,
  )
}

/** De estos shortcodes, cuáles ya tienen fila en `video_refs`. */
export async function refsExistentes(shortcodes: string[], sb: SupabaseClient = sb0()): Promise<Set<string>> {
  const out = new Set<string>()
  for (const lote of lotes([...new Set(shortcodes)])) {
    const { data, error } = await sb.from('video_refs').select('ig_shortcode').in('ig_shortcode', lote)
    falla('no se pudo leer video_refs', error)
    for (const f of (data ?? []) as Array<{ ig_shortcode: string }>) out.add(f.ig_shortcode)
  }
  return out
}

/**
 * Inserta la referencia, o si el reel ya está, refresca SOLO las métricas.
 * Se hace en dos pasos (select → update/insert) porque el índice único es parcial
 * (`WHERE ig_shortcode IS NOT NULL`) y un upsert genérico pisaría columnas del equipo.
 */
export async function upsertVideoRef(fila: Record<string, unknown>, sb: SupabaseClient = sb0()): Promise<'insertada' | 'actualizada'> {
  const shortcode = fila.ig_shortcode
  if (typeof shortcode !== 'string' || !shortcode) throw new Error('upsertVideoRef: la fila no trae ig_shortcode')
  const { data, error } = await sb.from('video_refs').select('id').eq('ig_shortcode', shortcode).maybeSingle()
  falla('no se pudo leer video_refs', error)
  if (data) {
    const { error: e2 } = await sb.from('video_refs').update(soloMetricas(fila)).eq('id', (data as { id: string }).id)
    falla(`no se pudieron actualizar las métricas de ${shortcode}`, e2)
    return 'actualizada'
  }
  const { error: e3 } = await sb.from('video_refs').insert(fila)
  falla(`no se pudo guardar la referencia ${shortcode}`, e3)
  return 'insertada'
}
