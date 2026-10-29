/**
 * Conectar consultas sin propiedad con su propiedad. Una conexión vale para el
 * AVISO entero (spec Entrega 2 §3.2): todas sus consultas quedan con esa
 * propiedad y, si la propiedad tiene asesor, el aviso se recuerda.
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
    external_url: d.externalUrl || null,
    active: true,
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

async function leerPropiedad(sb: SupabaseClient, propertyId: string): Promise<{ direccion: string; asesor: string | null }> {
  const { data: propiedad, error } = await sb
    .from('properties')
    .select('id, address, assigned_to')
    .eq('id', propertyId)
    .maybeSingle()
  if (error) fallo('Leer la propiedad', error)
  if (!propiedad) throw new ConsultaNoConectable(404, 'No encontramos la propiedad')
  return {
    direccion: typeof propiedad.address === 'string' ? propiedad.address : '',
    asesor: typeof propiedad.assigned_to === 'string' ? propiedad.assigned_to : null,
  }
}

/**
 * Las consultas SIN propiedad de un aviso (portal + código) quedan con la propiedad.
 * Con asesor, se recuerda el aviso (las próximas entran solas). Sin asesor NO:
 * recordar dejaría en el mapa un aviso que rutea a nadie —las consultas futuras
 * llegarían "identificadas" sin que ningún asesor se entere—, y tampoco se le
 * borra el asesor que ya tenía cada consulta.
 */
async function conectarPorCodigo(
  sb: SupabaseClient,
  d: { portal: string; codigo: string; propertyId: string; url: string | null },
): Promise<{ actualizadas: number; recordado: boolean }> {
  const { direccion, asesor } = await leerPropiedad(sb, d.propertyId)
  if (asesor) {
    const r = await identificarAviso(sb, {
      portal: d.portal, externalCode: d.codigo, address: direccion, assignedTo: asesor,
      propertyId: d.propertyId, externalUrl: d.url,
    }, { soloSinPropiedad: true })
    return { actualizadas: r.actualizadas, recordado: true }
  }
  const { data, error } = await sb
    .from('portal_inquiries')
    .update({ property_id: d.propertyId, property_address: direccion, is_unmatched: false })
    .eq('portal', d.portal)
    .eq('property_external_code', d.codigo)
    .is('property_id', null)
    .select('id')
  if (error) fallo('Conectar las consultas del aviso', error)
  return { actualizadas: (data ?? []).length, recordado: false }
}

/**
 * Conecta un AVISO con su propiedad desde la hoja "Avisos sin propiedad": una
 * sola llamada, todas sus consultas. El código tiene que identificar al aviso
 * (`codigoAgrupable`): uno que no lo hace (la REF de ZonaProp, un `https`
 * mal leído) conectaría consultas que no tienen nada que ver entre sí.
 */
export async function conectarAviso(
  sb: SupabaseClient,
  d: { portal: string; codigo: string; propertyId: string },
): Promise<{ actualizadas: number; recordado: boolean }> {
  if (!PORTALES_CON_AVISO.includes(d.portal) || !codigoAgrupable(d.portal, d.codigo)) {
    throw new ConsultaNoConectable(400, 'Ese código no identifica un aviso: conectá esas consultas de a una')
  }
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
  d: { consultaId: string; propertyId: string },
): Promise<{ actualizadas: number; recordado: boolean; agrupable: boolean }> {
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
      portal, codigo, propertyId: d.propertyId,
      url: typeof consulta.property_url === 'string' ? consulta.property_url : null,
    })
    return { ...r, agrupable: true }
  }

  // Sin código que agrupe, o una consulta que ya tenía propiedad (corrección
  // puntual): se toca SOLO esa. Corregir una no mueve las demás del aviso.
  const { direccion, asesor } = await leerPropiedad(sb, d.propertyId)
  const { data: actualizadas, error: errUpd } = await sb
    .from('portal_inquiries')
    .update({
      property_id: d.propertyId,
      property_address: direccion,
      is_unmatched: false,
      // Si la propiedad no tiene asesor, no se le borra el que ya tenía la consulta.
      ...(asesor ? { assigned_to: asesor } : {}),
    })
    .eq('id', d.consultaId)
    .select('id')
  if (errUpd) fallo('Conectar la consulta', errUpd)

  return { actualizadas: (actualizadas ?? []).length, recordado: false, agrupable: false }
}
