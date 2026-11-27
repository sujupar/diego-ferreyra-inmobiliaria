import 'server-only'
/**
 * Lecturas y escrituras de `video_bienvenida_enlaces` (design.md D2). Todo pasa por RPC con el
 * rol de servicio: la tabla no tiene policies de escritura y las funciones solo las ejecuta
 * `service_role`.
 *
 * NINGUNA función de este módulo lanza. Quien llama decide qué hacer con un `null`/`false`:
 * el envío manda la plantilla sin video, la página muestra "no encontrado", la medición se
 * pierde sin romper nada. Lanzar acá dentro de la cola del embudo haría reintentar el
 * trabajo y mandar el WhatsApp dos veces.
 */
import { createClient } from '@supabase/supabase-js'
import { esCodigoValido, generarCodigo, urlDelEnlace } from './codigo'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export interface Enlace {
  codigo: string
  url: string
}

/** Un choque de código (PK) es casi imposible (57^10); se reintenta igual. */
const INTENTOS = 3

export async function obtenerOCrearEnlace(input: {
  contactId: string
  dealId: string | null
  nombre: string | null
  origen: 'whatsapp' | 'manual'
  creadoPor: string | null
}): Promise<Enlace | null> {
  const sb = admin()
  for (let i = 0; i < INTENTOS; i++) {
    try {
      const { data, error } = await sb.rpc('video_bienvenida_obtener_o_crear', {
        p_contact: input.contactId,
        p_deal: input.dealId,
        p_nombre: input.nombre,
        p_origen: input.origen,
        p_creado_por: input.creadoPor,
        p_codigo: generarCodigo(),
      })
      if (error) {
        // 23505 en el PK = otro contacto ya tiene ese código: se prueba con otro.
        if (error.code === '23505') continue
        console.warn('[video-bienvenida] no se pudo crear el enlace:', error.message)
        return null
      }
      if (!esCodigoValido(data)) {
        console.warn('[video-bienvenida] la base devolvió un código inválido:', data)
        return null
      }
      return { codigo: data, url: urlDelEnlace(data) }
    } catch (e) {
      console.warn('[video-bienvenida] excepción creando el enlace:', e)
      return null
    }
  }
  console.warn('[video-bienvenida] tres choques de código seguidos')
  return null
}

/** Best-effort: el WhatsApp ya salió. Si esto lanzara, la cola reintentaría y lo mandaría dos veces. */
export async function marcarEnviado(codigo: string, wamid: string | null, dealId: string | null): Promise<void> {
  try {
    const { error } = await admin().rpc('video_bienvenida_marcar_enviado', { p_codigo: codigo, p_wamid: wamid, p_deal: dealId })
    if (error) console.warn('[video-bienvenida] no se pudo marcar el enlace como enviado:', error.message)
  } catch (e) {
    console.warn('[video-bienvenida] excepción marcando el enlace como enviado:', e)
  }
}

/**
 * El contacto del mensaje fallido, solo la PRIMERA vez (la RPC marca `respaldo_at` atómica). En la
 * misma transacción vuelve a encolar el trabajo de WhatsApp de ese proceso, sin video:
 * `encolado = false` quiere decir que no pudo (sin proceso, o el trabajo está corriendo).
 */
export type Respaldo = { contactId: string; nombre: string | null; encolado: boolean }

/** `'error'` = la base no respondió (no es lo mismo que "no hay nada que tomar", que es `null`). */
export async function tomarRespaldo(wamid: string, telefono: string): Promise<Respaldo | null | 'error'> {
  try {
    const { data, error } = await admin().rpc('video_bienvenida_tomar_respaldo', { p_wamid: wamid, p_phone: telefono })
    if (error) {
      console.warn('[video-bienvenida] no se pudo tomar el respaldo:', error.message)
      return 'error'
    }
    const fila = Array.isArray(data) ? (data[0] as { contact_id?: unknown; nombre?: unknown; encolado?: unknown } | undefined) : undefined
    if (!fila || typeof fila.contact_id !== 'string') return null
    return { contactId: fila.contact_id, nombre: typeof fila.nombre === 'string' ? fila.nombre : null, encolado: fila.encolado === true }
  } catch (e) {
    console.warn('[video-bienvenida] excepción tomando el respaldo:', e)
    return 'error'
  }
}

/** ¿Hay un enlace con este mensaje? Sirve para distinguir "ya se tomó el respaldo" de "no lo encuentro". */
export async function existeEnlaceDelMensaje(wamid: string): Promise<boolean | 'error'> {
  try {
    const { data, error } = await admin().from('video_bienvenida_enlaces').select('codigo').eq('wamid', wamid).limit(1).maybeSingle()
    if (error) return 'error'
    return !!data
  } catch {
    return 'error'
  }
}

export async function registrarApertura(codigo: string): Promise<boolean> {
  if (!esCodigoValido(codigo)) return false
  try {
    const { data, error } = await admin().rpc('video_bienvenida_registrar_apertura', { p_codigo: codigo })
    return !error && data === true
  } catch {
    return false
  }
}

export interface EnlaceLeido {
  codigo: string
  contactId: string
  nombre: string | null
  enviadoAt: string | null
  aperturas: number
}

export async function leerEnlacePorCodigo(codigo: string): Promise<EnlaceLeido | null> {
  if (!esCodigoValido(codigo)) return null
  try {
    const { data, error } = await admin()
      .from('video_bienvenida_enlaces')
      .select('codigo, contact_id, nombre, enviado_at, aperturas')
      .eq('codigo', codigo)
      .maybeSingle()
    if (error || !data) return null
    const r = data as { codigo: string; contact_id: string; nombre: string | null; enviado_at: string | null; aperturas: number }
    return { codigo: r.codigo, contactId: r.contact_id, nombre: r.nombre, enviadoAt: r.enviado_at, aperturas: r.aperturas }
  } catch {
    return null
  }
}

export async function leerEnlacePorContacto(contactId: string): Promise<Enlace | null> {
  try {
    const { data, error } = await admin()
      .from('video_bienvenida_enlaces')
      .select('codigo')
      .eq('contact_id', contactId)
      .maybeSingle()
    if (error || !data) return null
    const codigo = (data as { codigo: string }).codigo
    return esCodigoValido(codigo) ? { codigo, url: urlDelEnlace(codigo) } : null
  } catch {
    return null
  }
}

/** Tramos ya vistos de esta persona (todas las visitas y dispositivos), para el bloque de Paula. */
export async function leerTramosPrevios(codigo: string): Promise<{ watchedBuckets: string | null; durationS: number | null } | null> {
  try {
    const { data, error } = await admin()
      .from('video_view_state')
      .select('watched_buckets, duration_s, updated_at')
      .eq('anon_id', `bv:${codigo}`)
      .like('video_key', 'bienvenida-tasacion-%')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    const r = data as { watched_buckets: string | null; duration_s: number | null }
    return { watchedBuckets: r.watched_buckets, durationS: r.duration_s }
  } catch {
    return null
  }
}

/**
 * Lo que hace falta para crear el enlace a mano desde la ficha (D8): el proceso del embudo más
 * reciente del contacto y su nombre de pila. `null` si el contacto no tiene un proceso con
 * `origin='embudo'` (spec: el servidor lo verifica, 400). Lanza si la base no responde: la ruta
 * lo convierte en un error visible, no en "no tiene proceso".
 */
export async function datosParaCrearEnlace(contactId: string): Promise<{ dealId: string; nombre: string | null } | null> {
  const sb = admin()
  const [proc, cont] = await Promise.all([
    sb.from('deals').select('id').eq('contact_id', contactId).eq('origin', 'embudo')
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    sb.from('contacts').select('full_name').eq('id', contactId).maybeSingle(),
  ])
  if (proc.error) throw new Error(`proceso del embudo: ${proc.error.message}`)
  if (cont.error) throw new Error(`contacto: ${cont.error.message}`)
  if (!proc.data) return null
  const completo = (cont.data as { full_name?: string | null } | null)?.full_name?.trim() ?? ''
  const nombre = completo.split(/\s+/)[0] || null
  return { dealId: (proc.data as { id: string }).id, nombre }
}
