// Traducción de las respuestas crudas de Instagram a los tipos del radar.
// Ante una forma que no conocemos, TIRAN: mejor una corrida frenada que datos a medias.

import type { CuentaPerfil, ReelCrudo } from '../tipos'

type Obj = Record<string, unknown>

function inesperada(endpoint: string): never {
  throw new Error(`forma inesperada: ${endpoint}`)
}

function obj(v: unknown): Obj | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null
}

/** Número finito o null. Nunca NaN ni Infinity. */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function idTexto(v: unknown): string | null {
  if (typeof v === 'string' && /^\d+$/.test(v)) return v
  if (typeof v === 'number' && Number.isSafeInteger(v)) return String(v)
  return null
}

/** `taken_at` viene en segundos. Si no es una fecha válida, tira (nunca un ISO con NaN). */
function fechaISO(v: unknown, endpoint: string): string {
  const seg = num(v)
  if (seg === null || seg <= 0) inesperada(endpoint)
  const d = new Date(seg * 1000)
  if (Number.isNaN(d.getTime())) inesperada(endpoint)
  return d.toISOString()
}

/** Un "media" de Instagram (mismo diccionario en la API v1 y en GraphQL) → ReelCrudo. */
function mediaAReel(m: Obj, cuenta: string, endpoint: string): ReelCrudo {
  const shortcode = m.code
  const pk = idTexto(m.pk)
  if (typeof shortcode !== 'string' || !shortcode || !pk) inesperada(endpoint)
  const caption = obj(m.caption)
  const imagen = obj(m.image_versions2)
  const candidato = Array.isArray(imagen?.candidates) ? obj(imagen.candidates[0]) : null
  return {
    shortcode,
    pk,
    cuenta,
    publicadoAt: fechaISO(m.taken_at, endpoint),
    vistas: num(m.play_count) ?? num(m.ig_play_count) ?? num(m.view_count),
    likes: num(m.like_count),
    comentarios: num(m.comment_count),
    caption: typeof caption?.text === 'string' ? caption.text : '',
    duracionSeg: num(m.video_duration),
    urlPortada: typeof candidato?.url === 'string' ? candidato.url : null,
    // media_type 2 = video. Fotos (1) y carruseles (8) no son reels.
    esReel: m.media_type === 2,
  }
}

function usuarioDe(m: Obj): string | null {
  const u = obj(m.user)
  return typeof u?.username === 'string' && u.username ? u.username : null
}

/** Perfil: respuesta de PolarisProfilePageContentQuery (GraphQL de la web). */
export function parsearPerfil(json: unknown): CuentaPerfil {
  const user = obj(obj(obj(json)?.data)?.user)
  const usuario = user?.username
  const igUserId = idTexto(user?.id) ?? idTexto(user?.pk)
  if (typeof usuario !== 'string' || !usuario || !igUserId) inesperada('perfil')
  return { usuario, igUserId, seguidores: num(user?.follower_count) }
}

/**
 * Publicaciones de una cuenta. Acepta la grilla del perfil (PolarisProfilePostsQuery y su
 * paginación) y la respuesta v1 de `/api/v1/media/<pk>/info/`. Incluye posts sin video
 * (con esReel:false): el que llama decide.
 */
export function parsearReels(json: unknown, cuenta: string): ReelCrudo[] {
  const raiz = obj(json)
  const conexion = obj(obj(raiz?.data)?.xdt_api__v1__feed__user_timeline_graphql_connection)
  let medias: unknown[]
  if (conexion && Array.isArray(conexion.edges)) {
    medias = conexion.edges.map((e) => obj(e)?.node)
  } else if (raiz && Array.isArray(raiz.items)) {
    medias = raiz.items
  } else {
    inesperada('reels')
  }
  return medias.map((m) => {
    const o = obj(m)
    if (!o) inesperada('reels')
    return mediaAReel(o, cuenta, 'reels')
  })
}

export function haySiguientePaginaGrilla(json: unknown): boolean {
  const conexion = obj(obj(obj(json)?.data)?.xdt_api__v1__feed__user_timeline_graphql_connection)
  return obj(conexion?.page_info)?.has_next_page === true
}

export interface ReelDePestana {
  shortcode: string
  pk: string
  vistas: number | null
  likes: number | null
  comentarios: number | null
  urlPortada: string | null
}

/**
 * Pestaña Reels del perfil (PolarisProfileReelsTabContentQuery y su paginación).
 * Es la única vista de la cuenta que trae las reproducciones, pero NO trae fecha ni
 * texto: por eso no devuelve ReelCrudo y el cliente la cruza con la grilla.
 */
export function parsearPestanaReels(json: unknown): { reels: ReelDePestana[]; hayMas: boolean } {
  const conexion = obj(obj(obj(obj(json)?.data)?.fetch__XDTUserDict)?.clips_connection)
  if (!conexion || !Array.isArray(conexion.edges)) inesperada('reels-pestana')
  const reels = conexion.edges.map((e) => {
    const m = obj(obj(obj(e)?.node)?.media)
    const pk = idTexto(m?.pk)
    if (!m || typeof m.code !== 'string' || !pk) inesperada('reels-pestana')
    const imagen = obj(m.image_versions2)
    const candidato = Array.isArray(imagen?.candidates) ? obj(imagen.candidates[0]) : null
    return {
      shortcode: m.code,
      pk,
      vistas: num(m.play_count) ?? num(m.ig_play_count) ?? num(m.view_count),
      likes: num(m.like_count),
      comentarios: num(m.comment_count),
      urlPortada: typeof candidato?.url === 'string' ? candidato.url : null,
    }
  })
  return { reels, hayMas: obj(conexion.page_info)?.has_next_page === true }
}

/** Explorar: `/api/v1/discover/topical_explore/`. Devuelve solo videos. */
export function parsearExplorar(json: unknown): ReelCrudo[] {
  const secciones = obj(json)?.sectional_items
  if (!Array.isArray(secciones)) inesperada('explorar')
  const medias: Obj[] = []
  // Cada sección arma su grilla distinto (one_by_two_item, fill_items, medias…);
  // en todas el contenido cuelga de una clave `media`.
  const juntar = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(juntar)
    const o = obj(v)
    if (!o) return
    for (const [k, hijo] of Object.entries(o)) {
      const m = obj(hijo)
      if (k === 'media' && m && typeof m.code === 'string') medias.push(m)
      else juntar(hijo)
    }
  }
  secciones.forEach((s) => juntar(obj(s)?.layout_content))
  const vistos = new Set<string>()
  const out: ReelCrudo[] = []
  for (const m of medias) {
    const cuenta = usuarioDe(m)
    if (!cuenta) inesperada('explorar')
    const r = mediaAReel(m, cuenta, 'explorar')
    if (r.esReel && !vistos.has(r.shortcode)) {
      vistos.add(r.shortcode)
      out.push(r)
    }
  }
  return out
}

/**
 * Búsqueda por palabra (PolarisKeywordSearchExplorePageRelayQuery): la web devuelve
 * publicaciones sobre el término; las cuentas son sus autores, en el orden de Instagram.
 */
export function parsearBusqueda(json: unknown): string[] {
  const serp = obj(obj(obj(json)?.data)?.xdt_fbsearch__top_serp_graphql)
  if (!serp || !Array.isArray(serp.edges)) inesperada('busqueda')
  const usuarios: string[] = []
  for (const e of serp.edges) {
    const items = obj(obj(e)?.node)?.items
    if (!Array.isArray(items)) continue
    for (const it of items) {
      const o = obj(it)
      const u = o ? (usuarioDe(o) ?? usuarioDe(obj(o.media) ?? {})) : null
      if (u && !usuarios.includes(u)) usuarios.push(u)
    }
  }
  return usuarios
}

/** Comentarios: `/api/v1/media/<pk>/comments/` (ya vienen ordenados por relevancia). */
export function parsearComentarios(json: unknown): string[] {
  const comentarios = obj(json)?.comments
  if (!Array.isArray(comentarios)) inesperada('comentarios')
  return comentarios
    .map((c) => obj(c)?.text)
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
}

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** El shortcode de la URL es el id numérico del media en base 64 (alfabeto de Instagram). */
export function shortcodeAPk(shortcode: string): string {
  let pk = BigInt(0)
  for (const c of shortcode) {
    const i = ALFABETO.indexOf(c)
    if (i < 0) throw new Error(`shortcode inválido: ${shortcode}`)
    pk = pk * BigInt(64) + BigInt(i)
  }
  return pk.toString()
}
