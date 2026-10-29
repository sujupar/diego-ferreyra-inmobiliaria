import 'server-only'
/**
 * Lecturas de la bandeja de Consultas con SERVICE ROLE. Sin lógica de negocio
 * (está en ./bandeja.ts) y sin permisos: la ruta decide el alcance ANTES de
 * llamar acá, y este módulo lo aplica en la consulta a la base.
 *
 * Cliente sin tipar, como lib/visitas/datos.ts: types/database.types.ts no
 * conoce la vista `consultas_unificadas`. Los tipos de salida son los de ./tipos.ts
 * y cada fila se arma campo por campo.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { clausulasBusqueda } from '@/lib/filters/busqueda-texto'
import { esEstadoVisita } from '@/lib/visitas/transiciones'
import type { Alcance } from '@/lib/visitas/acceso'
import type { ConsultaFila, VisitaDeConsulta } from './tipos'

function sb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan las credenciales de Supabase en el servidor')
  return createClient(url, key)
}

function fallo(contexto: string, error: { message: string } | null): never {
  throw new Error(`${contexto}: ${error?.message ?? 'error desconocido'}`)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Los ids del alcance y del filtro de asesor van CRUDOS dentro de un `or()` de
 * PostgREST. Un UUID no puede traer comas ni paréntesis: validar la forma acá
 * cierra esa puerta sin depender de que quien llama ya lo haya hecho.
 */
function exigirUuid(valor: string, campo: string): void {
  if (!UUID_RE.test(valor)) throw new Error(`${campo} no es un UUID válido`)
}

/** PostgREST corta TODA respuesta en 1000 filas sin avisar (CLAUDE.md § tope de 1000 filas). */
export const TAMANO_PAGINA_BASE = 1000
/** 20.000 consultas: más que varios años enteros de esta inmobiliaria (hoy ~670 en total). */
export const MAX_PAGINAS_BASE = 20
/** Ids por `in(...)`: 200 uuids son ~7,5 KB de dirección, lejos del tope de cabeceras. */
const LOTE_IDS = 200

const COLUMNAS_CONSULTA = `id, tipo, numero, recibida_at, canal, portal, nombre, telefono, email, mensaje,
  property_id, assigned_to, asesor_propiedad, aviso_codigo, aviso_url, aviso_direccion, aviso_titulo, utm`

/** Columnas donde busca el texto libre. */
const COLUMNAS_BUSQUEDA = ['nombre', 'telefono', 'email', 'aviso_direccion', 'mensaje'] as const

export interface FiltroConsultas {
  alcance: Alcance
  /** Instantes ISO inclusivos sobre `recibida_at` (ya convertidos a la hora argentina). */
  desde: string
  hasta: string
  portal: string | null
  propiedad: string | 'sin' | null
  asesor: string | 'sin' | null
  q: string
}

function textoONulo(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null
}

/**
 * `canal` de una consulta de portal es `portal_inquiries.inquiry_type`, que la
 * columna admite también como `phone` o NULL (hoy no hay ninguna: verificado el
 * 2026-10-29). Toda consulta de portal entra por el MAIL del portal; solo
 * `whatsapp` dice que la persona pidió ese canal. Un valor raro no puede tirar
 * la bandeja entera, así que cae en `mail`.
 */
function canalDe(tipo: ConsultaFila['tipo'], v: unknown): ConsultaFila['canal'] {
  if (tipo === 'landing') return 'landing'
  return v === 'whatsapp' ? 'whatsapp' : 'mail'
}

function aFila(r: Record<string, unknown>): ConsultaFila {
  const tipo = r.tipo === 'portal' || r.tipo === 'landing' ? r.tipo : null
  if (tipo === null) throw new Error(`consultas: tipo desconocido "${String(r.tipo)}"`)
  return {
    id: String(r.id),
    tipo,
    numero: typeof r.numero === 'number' ? r.numero : null,
    recibida_at: String(r.recibida_at ?? ''),
    canal: canalDe(tipo, r.canal),
    portal: String(r.portal ?? ''),
    nombre: textoONulo(r.nombre),
    telefono: textoONulo(r.telefono),
    email: textoONulo(r.email),
    mensaje: textoONulo(r.mensaje),
    property_id: textoONulo(r.property_id),
    assigned_to: textoONulo(r.assigned_to),
    asesor_propiedad: textoONulo(r.asesor_propiedad),
    aviso_codigo: textoONulo(r.aviso_codigo),
    aviso_url: textoONulo(r.aviso_url),
    aviso_direccion: textoONulo(r.aviso_direccion),
    aviso_titulo: textoONulo(r.aviso_titulo),
    utm: r.utm ?? null,
  }
}

function consultaFiltrada(f: FiltroConsultas) {
  let q = sb().from('consultas_unificadas').select(COLUMNAS_CONSULTA)
    .gte('recibida_at', f.desde).lte('recibida_at', f.hasta)
  if (f.alcance.tipo === 'propio') {
    exigirUuid(f.alcance.usuarioId, 'usuarioId')
    q = q.or(`assigned_to.eq.${f.alcance.usuarioId},asesor_propiedad.eq.${f.alcance.usuarioId}`)
  }
  if (f.portal) q = q.eq('portal', f.portal)
  if (f.propiedad === 'sin') q = q.is('property_id', null)
  else if (f.propiedad) q = q.eq('property_id', f.propiedad)
  // El asesor de una consulta es el de su PROPIEDAD; el de la consulta cuenta
  // solo si la propiedad no tiene (misma regla que `asesor_nombre` en
  // consultasEnBandeja). Filtrar por `assigned_to` a secas mostraría bajo
  // "Sin asesor" consultas que en pantalla dicen el nombre de un asesor.
  if (f.asesor === 'sin') q = q.is('asesor_propiedad', null).is('assigned_to', null)
  else if (f.asesor) {
    exigirUuid(f.asesor, 'asesor')
    q = q.or(`asesor_propiedad.eq.${f.asesor},and(asesor_propiedad.is.null,assigned_to.eq.${f.asesor})`)
  }
  // Varios `.or()` se combinan con Y: cada palabra tiene que aparecer en alguna columna.
  for (const clausula of clausulasBusqueda(COLUMNAS_BUSQUEDA, f.q)) q = q.or(clausula)
  return q
}

/**
 * TODAS las consultas del período, de a 1000, con orden fijo y ÚNICO
 * (`recibida_at` desc, `id` desc): paginar sin orden repite o saltea filas.
 * La bandeja necesita el período entero (tarjetas, repetidas, estado), no una
 * página: el paginado de 25 lo hace `armarBandeja` en memoria.
 */
export async function consultasDelPeriodo(f: FiltroConsultas): Promise<{ filas: ConsultaFila[]; truncado: boolean }> {
  const filas: ConsultaFila[] = []
  for (let pagina = 0; pagina < MAX_PAGINAS_BASE; pagina++) {
    const desde = pagina * TAMANO_PAGINA_BASE
    const { data, error } = await consultaFiltrada(f)
      .order('recibida_at', { ascending: false }).order('id', { ascending: false })
      .range(desde, desde + TAMANO_PAGINA_BASE - 1)
    if (error) fallo('listar consultas', error)
    const lote = (data ?? []) as Record<string, unknown>[]
    filas.push(...lote.map(aFila))
    if (lote.length < TAMANO_PAGINA_BASE) return { filas, truncado: false }
  }
  return { filas, truncado: true }
}

function enLotes<T>(lista: readonly T[], tamano: number): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < lista.length; i += tamano) lotes.push(lista.slice(i, i + tamano))
  return lotes
}

function sinRepetir(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => id))]
}

const COLUMNAS_VISITA = 'id, property_id, portal_inquiry_id, client_phone, status, scheduled_at'

function aVisita(r: Record<string, unknown>): VisitaDeConsulta {
  if (!esEstadoVisita(r.status)) throw new Error(`visitas de consultas: estado desconocido "${String(r.status)}"`)
  return {
    id: String(r.id),
    property_id: String(r.property_id),
    portal_inquiry_id: textoONulo(r.portal_inquiry_id),
    client_phone: textoONulo(r.client_phone),
    status: r.status,
    scheduled_at: String(r.scheduled_at),
  }
}

/** Todas las visitas no canceladas con `columna in (ids)`, paginando cada lote. */
async function visitasPor(columna: 'portal_inquiry_id' | 'property_id', ids: readonly string[]): Promise<VisitaDeConsulta[]> {
  const visitas: VisitaDeConsulta[] = []
  for (const lote of enLotes(ids, LOTE_IDS)) {
    for (let pagina = 0; pagina < MAX_PAGINAS_BASE; pagina++) {
      const desde = pagina * TAMANO_PAGINA_BASE
      const { data, error } = await sb().from('property_visits').select(COLUMNAS_VISITA)
        .in(columna, lote).neq('status', 'cancelled')
        .order('id', { ascending: true })
        .range(desde, desde + TAMANO_PAGINA_BASE - 1)
      if (error) fallo('visitas de consultas', error)
      const filas = (data ?? []) as Record<string, unknown>[]
      visitas.push(...filas.map(aVisita))
      if (filas.length < TAMANO_PAGINA_BASE) break
    }
  }
  return visitas
}

/**
 * Las visitas que pueden ser de estas consultas: las vinculadas por
 * `portal_inquiry_id` y, para las cargadas sin ese vínculo, todas las de las
 * mismas propiedades (`estadoDeConsulta` las empareja por teléfono). Dos
 * consultas y no un `or()`: así cada una usa su índice. Sin canceladas: no
 * cuentan como visita. Sin repetidas (una visita puede salir en las dos).
 */
export async function visitasParaConsultas(propertyIds: string[], inquiryIds: string[]): Promise<VisitaDeConsulta[]> {
  const [porVinculo, porPropiedad] = await Promise.all([
    visitasPor('portal_inquiry_id', sinRepetir(inquiryIds)),
    visitasPor('property_id', sinRepetir(propertyIds)),
  ])
  const unicas = new Map<string, VisitaDeConsulta>()
  for (const v of [...porVinculo, ...porPropiedad]) unicas.set(v.id, v)
  return [...unicas.values()]
}

/** Dirección y barrio de cada propiedad, y nombre de cada asesor, para mostrar. */
export async function propiedadesYAsesores(
  propertyIds: string[],
  asesorIds: string[],
): Promise<{ propiedades: Map<string, { address: string; neighborhood: string | null }>; asesores: Map<string, string> }> {
  const propiedades = new Map<string, { address: string; neighborhood: string | null }>()
  const asesores = new Map<string, string>()
  await Promise.all([
    ...enLotes(sinRepetir(propertyIds), LOTE_IDS).map(async (lote) => {
      const { data, error } = await sb().from('properties').select('id, address, neighborhood').in('id', lote)
      if (error) fallo('direcciones de consultas', error)
      for (const r of (data ?? []) as Record<string, unknown>[]) {
        propiedades.set(String(r.id), { address: String(r.address ?? ''), neighborhood: textoONulo(r.neighborhood) })
      }
    }),
    ...enLotes(sinRepetir(asesorIds), LOTE_IDS).map(async (lote) => {
      const { data, error } = await sb().from('profiles').select('id, full_name').in('id', lote)
      if (error) fallo('asesores de consultas', error)
      for (const r of (data ?? []) as Record<string, unknown>[]) {
        const nombre = textoONulo(r.full_name)
        if (nombre) asesores.set(String(r.id), nombre)
      }
    }),
  ])
  return { propiedades, asesores }
}
