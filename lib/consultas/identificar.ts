/**
 * Conectar una consulta con su propiedad, y opcionalmente "recordar el aviso".
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

  const { data: actualizadas, error: errUpd } = await sb
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
    .select('id')
  if (errUpd) fallo('Corregir las consultas del aviso', errUpd)

  return { mapId, actualizadas: (actualizadas ?? []).length }
}

/**
 * Conecta UNA consulta con una propiedad. Con `recordar` y si se puede (consulta
 * de portal con código, propiedad con asesor), identifica el aviso entero.
 * Si no, toca solo esa consulta y devuelve `recordado: false`.
 *
 * Una consulta de portal que ya tenía propiedad se puede reconectar: es la
 * forma de corregir una conexión equivocada. Las de landing nacen con su
 * propiedad (vienen de SU página), así que no se reconectan desde acá.
 */
export async function conectarConsulta(
  sb: SupabaseClient,
  d: { consultaId: string; propertyId: string; recordar: boolean },
): Promise<{ actualizadas: number; recordado: boolean }> {
  const { data: consulta, error: errConsulta } = await sb
    .from('portal_inquiries')
    .select('id, portal, property_external_code, property_url')
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

  const { data: propiedad, error: errProp } = await sb
    .from('properties')
    .select('id, address, assigned_to')
    .eq('id', d.propertyId)
    .maybeSingle()
  if (errProp) fallo('Leer la propiedad', errProp)
  if (!propiedad) throw new ConsultaNoConectable(404, 'No encontramos la propiedad')

  const direccion = typeof propiedad.address === 'string' ? propiedad.address : ''
  const asesor = typeof propiedad.assigned_to === 'string' ? propiedad.assigned_to : null
  // El código va TAL CUAL está guardado: la corrección hacia atrás compara por
  // igualdad exacta, y un código recortado dejaría afuera a esta misma consulta.
  const codigo = typeof consulta.property_external_code === 'string' && consulta.property_external_code.trim()
    ? consulta.property_external_code
    : ''

  // Recordar sin asesor dejaría en el mapa un aviso que rutea a nadie: las
  // consultas futuras llegarían "identificadas" sin que ningún asesor se entere.
  if (d.recordar && codigo && asesor) {
    const r = await identificarAviso(sb, {
      portal: String(consulta.portal),
      externalCode: codigo,
      address: direccion,
      assignedTo: asesor,
      propertyId: d.propertyId,
      externalUrl: typeof consulta.property_url === 'string' ? consulta.property_url : null,
    })
    return { actualizadas: r.actualizadas, recordado: true }
  }

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

  return { actualizadas: (actualizadas ?? []).length, recordado: false }
}
