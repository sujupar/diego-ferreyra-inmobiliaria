/**
 * Conectar consultas sin propiedad con su propiedad. Una conexión vale para el
 * AVISO entero (spec Entrega 2 §3.2): todas sus consultas quedan con esa
 * propiedad y con QUIEN LA MUESTRA, y el aviso se recuerda.
 *
 * Quien la muestra NO es quien la captó (dueño, 2026-10-30): son comisiones
 * distintas —si la captó Diego y la muestra Lucas, Lucas cobra el 20 %; si la
 * captó Lucas, el 50 %—. Por eso se elige aparte, se guarda en el aviso
 * (`portal_property_map.assigned_to`) y en sus consultas (`assigned_to`, a quien
 * `notify.ts` le manda el WhatsApp), y acá NUNCA se escribe `properties`. Antes
 * se copiaba `properties.assigned_to`: eso mezclaba las dos cosas.
 *
 * Recordar = completar la fila del aviso en `portal_property_map` (portal +
 * código). Desde ahí las consultas que YA entraron por ese aviso se corrigen
 * hacia atrás acá mismo, y las que entren después rutean solas: el cron de
 * ingesta (`matchProperty` en lib/integrations/portal-inquiries/match.ts) busca
 * primero por código en las filas ACTIVAS del mapa — por eso la fila se guarda
 * con `active: true`.
 *
 * Recibe el cliente de Supabase (service role) de quien llama: las rutas ya
 * decidieron los permisos. supabase-js NO lanza ante un error de la base,
 * devuelve `{ error }`: cada llamada lo mira y lo lanza. Un error tragado acá
 * se vería como "no existe" o "no había nada que corregir".
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { codigoAgrupable } from './avisos'

/** Los portales con avisos (las landings no tienen código de aviso). */
const PORTALES_CON_AVISO = ['zonaprop', 'argenprop', 'mercadolibre']

/** Quiénes muestran propiedades: los mismos de la lista de asesores (`asesoresActivos`). */
const ROLES_QUE_MUESTRAN = ['asesor', 'dueno']

/** Un pedido que no se puede cumplir por el dato, no por la base: la ruta lo devuelve tal cual. */
export class ConsultaNoConectable extends Error {
  constructor(readonly status: 400 | 404, mensaje: string) {
    super(mensaje)
    this.name = 'ConsultaNoConectable'
  }
}

function fallo(contexto: string, error: { message: string }): never {
  throw new Error(`${contexto}: ${error.message}`)
}

export interface DatosAviso {
  portal: string
  externalCode: string
  address: string
  assignedTo: string
  propertyId: string | null
  externalUrl: string | null
}

/**
 * Identifica un aviso: completa (o crea) su fila del mapa y corrige HACIA ATRÁS
 * todas las consultas de ese portal + código. Idempotente: volver a
 * identificarlo pisa los valores anteriores (así se corrige un error).
 */
export async function identificarAviso(
  sb: SupabaseClient,
  d: DatosAviso,
  opciones: { soloSinPropiedad?: boolean } = {},
): Promise<{ mapId: string; actualizadas: number }> {
  const record = {
    portal: d.portal,
    external_code: d.externalCode,
    address: d.address,
    assigned_to: d.assignedTo,
    property_id: d.propertyId,
    // Sin enlace nuevo no se pisa el que el mapa ya tenía (lo pudo haber
    // guardado el cron o el scraper): un null borraría el "Ver aviso".
    ...(d.externalUrl ? { external_url: d.externalUrl } : {}),
    active: true,
    // Fija cuál es el aviso más reciente de la propiedad (`quienMuestraLaPropiedad`).
    updated_at: new Date().toISOString(),
  }

  // Si leer el mapa falla y se siguiera de largo, se insertaría una SEGUNDA
  // fila para el mismo aviso y el match del cron quedaría ambiguo.
  const { data: existente, error: errLeer } = await sb
    .from('portal_property_map')
    .select('id')
    .eq('portal', d.portal)
    .eq('external_code', d.externalCode)
    .maybeSingle()
  if (errLeer) fallo('Leer el aviso en el mapa', errLeer)

  let mapId: string
  if (existente) {
    mapId = String(existente.id)
    const { error } = await sb.from('portal_property_map').update(record).eq('id', mapId)
    if (error) fallo('Actualizar el aviso en el mapa', error)
  } else {
    const { data: creado, error } = await sb.from('portal_property_map').insert(record).select('id').single()
    if (error) fallo('Crear el aviso en el mapa', error)
    mapId = String(creado.id)
  }

  let corregir = sb
    .from('portal_inquiries')
    .update({
      assigned_to: d.assignedTo,
      property_id: d.propertyId,
      property_address: d.address,
      matched_map_id: mapId,
      is_unmatched: false,
    })
    .eq('portal', d.portal)
    .eq('property_external_code', d.externalCode)
  // Desde Consultas se conectan solo las que NO tienen propiedad: una que ya
  // tenía otra (quizás con una visita agendada ahí) no se mueve sin que nadie lo
  // decida. La pantalla de identificación de avisos sí corrige todo el aviso.
  if (opciones.soloSinPropiedad) corregir = corregir.is('property_id', null)
  const { data: actualizadas, error: errUpd } = await corregir.select('id')
  if (errUpd) fallo('Corregir las consultas del aviso', errUpd)

  return { mapId, actualizadas: (actualizadas ?? []).length }
}

async function direccionDeLaPropiedad(sb: SupabaseClient, propertyId: string): Promise<string> {
  const { data: propiedad, error } = await sb
    .from('properties')
    .select('id, address')
    .eq('id', propertyId)
    .maybeSingle()
  if (error) fallo('Leer la propiedad', error)
  if (!propiedad) throw new ConsultaNoConectable(404, 'No encontramos la propiedad')
  return typeof propiedad.address === 'string' ? propiedad.address : ''
}

/**
 * Quien la muestra tiene que ser alguien que muestra propiedades y sigue activo:
 * un id cualquiera mandaría el WhatsApp de las consultas futuras a nadie (o a un
 * abogado). Se valida ANTES de escribir nada.
 */
async function validarQuienMuestra(sb: SupabaseClient, muestraId: string): Promise<void> {
  const { data, error } = await sb
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', muestraId)
    .maybeSingle()
  if (error) fallo('Leer quién muestra la propiedad', error)
  if (!data || data.is_active !== true || !ROLES_QUE_MUESTRAN.includes(String(data.role))) {
    throw new ConsultaNoConectable(400, 'Elegí quién muestra la propiedad')
  }
}

/**
 * Quién muestra hoy la propiedad, según sus avisos ya conectados: el del aviso
 * activo más reciente. Sirve para proponerlo al conectar otro aviso de la misma
 * propiedad. NUNCA se propone a quien la captó (otra comisión): publicar desde
 * la plataforma (`syncPortalPropertyMap`) deja al captador en el aviso, así que
 * quien coincide con `properties.assigned_to` se salta. Si de verdad la muestra
 * quien la captó, se elige a mano. Sin nadie, null.
 */
export async function quienMuestraLaPropiedad(sb: SupabaseClient, propertyId: string): Promise<string | null> {
  const { data: propiedad, error: errProp } = await sb
    .from('properties')
    .select('id, assigned_to')
    .eq('id', propertyId)
    .maybeSingle()
  if (errProp) fallo('Leer la propiedad', errProp)
  const captador = typeof propiedad?.assigned_to === 'string' ? propiedad.assigned_to : null
  // Una propiedad tiene a lo sumo un aviso por portal: se leen todos y se elige acá.
  const { data, error } = await sb
    .from('portal_property_map')
    .select('assigned_to, updated_at')
    .eq('property_id', propertyId)
    .eq('active', true)
  if (error) fallo('Leer los avisos de la propiedad', error)
  let elegido: string | null = null
  let cuando = Number.NEGATIVE_INFINITY
  for (const f of (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>) {
    if (typeof f.assigned_to !== 'string' || !f.assigned_to || f.assigned_to === captador) continue
    const t = typeof f.updated_at === 'string' ? Date.parse(f.updated_at) : Number.NaN
    const ms = Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t
    if (elegido === null || ms > cuando) { elegido = f.assigned_to; cuando = ms }
  }
  return elegido
}

/**
 * Las consultas SIN propiedad de un aviso (portal + código) quedan con la
 * propiedad y con quien la muestra, y el aviso se recuerda: las próximas entran
 * solas y le llegan a esa persona.
 */
async function conectarPorCodigo(
  sb: SupabaseClient,
  d: { portal: string; codigo: string; propertyId: string; url: string | null; muestraId: string },
): Promise<{ actualizadas: number; recordado: boolean }> {
  const direccion = await direccionDeLaPropiedad(sb, d.propertyId)
  const r = await identificarAviso(sb, {
    portal: d.portal, externalCode: d.codigo, address: direccion, assignedTo: d.muestraId,
    propertyId: d.propertyId, externalUrl: d.url,
  }, { soloSinPropiedad: true })
  return { actualizadas: r.actualizadas, recordado: true }
}

/**
 * Conecta un AVISO con su propiedad desde la hoja "Avisos sin propiedad": una
 * sola llamada, todas sus consultas. El código tiene que identificar al aviso
 * (`codigoAgrupable`): uno que no lo hace (la REF de ZonaProp, un `https`
 * mal leído) conectaría consultas que no tienen nada que ver entre sí.
 */
export async function conectarAviso(
  sb: SupabaseClient,
  d: { portal: string; codigo: string; propertyId: string; muestraId: string },
): Promise<{ actualizadas: number; recordado: boolean }> {
  if (!PORTALES_CON_AVISO.includes(d.portal) || !codigoAgrupable(d.portal, d.codigo)) {
    throw new ConsultaNoConectable(400, 'Ese código no identifica un aviso: conectá esas consultas de a una')
  }
  await validarQuienMuestra(sb, d.muestraId)
  // Un aviso tiene a lo sumo unas decenas de consultas: se leen todas acá.
  const { data, error } = await sb
    .from('portal_inquiries')
    .select('property_id, property_url, received_at')
    .eq('portal', d.portal)
    .eq('property_external_code', d.codigo)
  if (error) fallo('Leer las consultas del aviso', error)
  const delAviso = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>
  // Sin consultas pendientes no se escribe nada: un código mal tipeado dejaría
  // en el mapa una regla de ruteo para un aviso que no existe.
  if (!delAviso.some((f) => f.property_id === null || f.property_id === undefined)) {
    throw new ConsultaNoConectable(404, 'Ese aviso ya no tiene consultas sin propiedad')
  }
  // El enlace del aviso que trajo la consulta MÁS NUEVA: se guarda en el mapa.
  let url: string | null = null
  let cuando = Number.NEGATIVE_INFINITY
  for (const f of delAviso) {
    const t = typeof f.received_at === 'string' ? Date.parse(f.received_at) : Number.NaN
    const ms = Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t
    if (typeof f.property_url === 'string' && f.property_url && (url === null || ms > cuando)) { url = f.property_url; cuando = ms }
  }
  return conectarPorCodigo(sb, { ...d, url })
}

/**
 * Conecta una consulta con una propiedad. Si su código identifica al aviso, se
 * conectan TODAS las de ese aviso (antes había que marcar "Recordar"; el dueño
 * pidió que una conexión alcance). Si no (sin código, `https`, la REF de
 * ZonaProp), solo esa, y `agrupable: false` le permite a la pantalla decirlo.
 *
 * Una consulta de portal que ya tenía propiedad se puede reconectar: es la
 * forma de corregir una conexión equivocada. Las de landing nacen con su
 * propiedad (vienen de SU página), así que no se reconectan desde acá.
 */
export async function conectarConsulta(
  sb: SupabaseClient,
  d: { consultaId: string; propertyId: string; muestraId: string },
): Promise<{ actualizadas: number; recordado: boolean; agrupable: boolean }> {
  await validarQuienMuestra(sb, d.muestraId)
  const { data: consulta, error: errConsulta } = await sb
    .from('portal_inquiries')
    .select('id, portal, property_external_code, property_url, property_id')
    .eq('id', d.consultaId)
    .maybeSingle()
  if (errConsulta) fallo('Leer la consulta', errConsulta)

  if (!consulta) {
    const { data: lead, error: errLead } = await sb
      .from('property_leads')
      .select('id, property_id')
      .eq('id', d.consultaId)
      .maybeSingle()
    if (errLead) fallo('Leer la consulta de landing', errLead)
    // Un registro de landing nace con su propiedad (columna NOT NULL); si alguna
    // vez llegara sin ella, decir "ya tiene propiedad" sería falso: se dice que
    // estas consultas no se conectan desde acá.
    if (lead) {
      throw new ConsultaNoConectable(400, lead.property_id
        ? 'Esta consulta ya tiene propiedad'
        : 'Las consultas de landing no se conectan desde acá')
    }
    throw new ConsultaNoConectable(404, 'No encontramos la consulta')
  }

  const portal = String(consulta.portal)
  // El código va TAL CUAL está guardado: la corrección hacia atrás compara por
  // igualdad exacta, y un código recortado dejaría afuera a esta misma consulta.
  const codigo = typeof consulta.property_external_code === 'string' ? consulta.property_external_code : null
  const yaTeniaPropiedad = typeof consulta.property_id === 'string' && consulta.property_id !== ''
  if (codigo !== null && codigoAgrupable(portal, codigo) && !yaTeniaPropiedad) {
    const r = await conectarPorCodigo(sb, {
      portal, codigo, propertyId: d.propertyId, muestraId: d.muestraId,
      url: typeof consulta.property_url === 'string' ? consulta.property_url : null,
    })
    return { ...r, agrupable: true }
  }

  // Sin código que agrupe, o una consulta que ya tenía propiedad (corrección
  // puntual): se toca SOLO esa. Corregir una no mueve las demás del aviso.
  const direccion = await direccionDeLaPropiedad(sb, d.propertyId)
  const { data: actualizadas, error: errUpd } = await sb
    .from('portal_inquiries')
    .update({
      property_id: d.propertyId,
      property_address: direccion,
      is_unmatched: false,
      assigned_to: d.muestraId,
    })
    .eq('id', d.consultaId)
    .select('id')
  if (errUpd) fallo('Conectar la consulta', errUpd)

  return { actualizadas: (actualizadas ?? []).length, recordado: false, agrupable: false }
}
