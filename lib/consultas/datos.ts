import 'server-only'
/**
 * Lectura de la sección Consultas con SERVICE ROLE. Sin lógica de negocio
 * (está en ./bandeja.ts) y sin permisos: quien llama decide el alcance ANTES,
 * y este módulo lo pasa a la base.
 *
 * Es UNA sola llamada (`consultas_del_periodo`, migración 20261029000002): cada
 * pedido a la plataforma ya cuesta ~1 s de piso y antes se hacían hasta cuatro
 * lecturas en dos tandas.
 *
 * Cliente sin tipar, como lib/visitas/datos.ts: types/database.types.ts no
 * conoce la función. Los tipos de salida son los de ./tipos.ts y cada fila se
 * arma campo por campo: un dato con otra forma tira un error que se ve, no una
 * pantalla con huecos.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
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
 * Más consultas que esto en un período no viajan: se muestran las más nuevas y
 * la pantalla lo avisa. Un año entero son ~670 hoy (≈160 por mes).
 */
export const MAX_CONSULTAS_PERIODO = 3000

export interface FiltroPeriodo {
  alcance: Alcance
  /** Instantes ISO inclusivos sobre `recibida_at` (ya convertidos a la hora argentina). */
  desde: string
  hasta: string
}

export interface DatosDelPeriodo {
  filas: ConsultaFila[]
  visitas: VisitaDeConsulta[]
  propiedades: Map<string, { address: string; neighborhood: string | null }>
  asesores: Map<string, string>
  truncado: boolean
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

function aVisita(r: Record<string, unknown>): VisitaDeConsulta {
  if (!esEstadoVisita(r.status)) throw new Error(`visitas de consultas: estado desconocido "${String(r.status)}"`)
  return {
    id: String(r.id),
    property_id: String(r.property_id),
    portal_inquiry_id: textoONulo(r.portal_inquiry_id),
    lead_id: textoONulo(r.lead_id),
    client_phone: textoONulo(r.client_phone),
    status: r.status,
    scheduled_at: String(r.scheduled_at),
  }
}

function lista(v: unknown, campo: string): Record<string, unknown>[] {
  if (!Array.isArray(v)) throw new Error(`consultas_del_periodo: falta "${campo}"`)
  return v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
}

/** Todo lo de un período en un viaje: consultas, visitas candidatas, direcciones y asesores. */
export async function leerPeriodo(f: FiltroPeriodo): Promise<DatosDelPeriodo> {
  let usuario: string | null = null
  if (f.alcance.tipo === 'propio') {
    if (!UUID_RE.test(f.alcance.usuarioId)) throw new Error('usuarioId no es un UUID válido')
    usuario = f.alcance.usuarioId
  }
  const { data, error } = await sb().rpc('consultas_del_periodo', {
    p_desde: f.desde, p_hasta: f.hasta, p_usuario: usuario, p_limite: MAX_CONSULTAS_PERIODO,
  })
  if (error) fallo('leer el período de consultas', error)
  if (!data || typeof data !== 'object') throw new Error('consultas_del_periodo: respuesta vacía')
  const r = data as Record<string, unknown>

  const propiedades = new Map<string, { address: string; neighborhood: string | null }>()
  for (const p of lista(r.propiedades, 'propiedades')) {
    propiedades.set(String(p.id), { address: String(p.address ?? ''), neighborhood: textoONulo(p.neighborhood) })
  }
  const asesores = new Map<string, string>()
  for (const a of lista(r.asesores, 'asesores')) {
    const nombre = textoONulo(a.full_name)
    if (nombre) asesores.set(String(a.id), nombre)
  }
  return {
    filas: lista(r.consultas, 'consultas').map(aFila),
    visitas: lista(r.visitas, 'visitas').map(aVisita),
    propiedades,
    asesores,
    truncado: r.truncado === true,
  }
}
