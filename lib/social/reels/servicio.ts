/**
 * Lectura y escritura de los reels en la base.
 *
 * Las rutas son finas: validan quién es, validan lo que llega y llaman acá. Toda
 * la decisión de negocio vive en los módulos puros de al lado, que se prueban
 * sin base ni red.
 *
 * Se usa el cliente de servicio (que NO pasa por RLS) porque el webhook y el
 * cron tienen que poder escribir sin sesión. El permiso de verdad lo decide
 * `autorizarReel()` en cada ruta: la RLS de la migración es la segunda barrera,
 * para el día que alguien consulte la tabla desde otro lado.
 */
import { createClient } from '@supabase/supabase-js'
import { puedeDifundir } from '@/lib/properties/difusion-access-server'
import { armarDescripcionReel, type DatosDescripcion } from './descripcion'
import { camposEditables, type CamposEditablesReel } from './edicion'
import type { EstadoReel } from './estados'

function admin() {
  // Sin el genérico <Database>: las tablas de reels no están en los tipos
  // generados (la CLI de Supabase no conecta para regenerarlos). Las filas se
  // castean a las formas declaradas abajo.
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export interface FilaReel {
  id: string
  property_id: string
  origen: 'subido' | 'existente'
  video_url: string | null
  descripcion: string
  palabra_clave: string | null
  dm_texto: string | null
  dm_boton: string
  dm_seguimiento: string | null
  estado: EstadoReel
  programado_para: string | null
  ig_media_id: string | null
  ig_permalink: string | null
  publicado_en: string | null
  ultimo_error: string | null
  automatizacion_activa: boolean
  automatizacion_desde: string | null
  simulacro: boolean
  created_at: string
}

/** Contadores que se muestran en la fila del reel. */
export interface ResumenReel {
  coincidencias: number
  privadosEnviados: number
  botonesTocados: number
}

/**
 * El permiso. La política vive en UNA tabla (`lib/properties/difusion-access.ts`)
 * porque antes estaba copiada a mano en más de veinte archivos.
 */
export async function autorizarReel(
  propertyId: string,
  userId: string,
  role: string,
): Promise<boolean> {
  return puedeDifundir(propertyId, userId, role, 'difundir')
}

/** Solo mirar: el abogado entra acá, pero no a `autorizarReel`. */
export async function autorizarVerReels(
  propertyId: string,
  userId: string,
  role: string,
): Promise<boolean> {
  return puedeDifundir(propertyId, userId, role, 'ver_difusion')
}

export async function listarReels(propertyId: string): Promise<FilaReel[]> {
  const { data, error } = await admin()
    .from('property_reels')
    .select('*')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`No se pudieron leer los reels: ${error.message}`)
  return (data ?? []) as unknown as FilaReel[]
}

/**
 * ¿La propiedad tiene landing PUBLICADA?
 *
 * Es el candado: sin landing no hay adónde mandar a la persona cuando toca el
 * botón, así que no tiene sentido publicar el reel. Un borrador no alcanza.
 */
export async function landingPublicada(
  propertyId: string,
): Promise<{ publicada: boolean; slug: string | null }> {
  const { data } = await admin()
    .from('property_landings')
    .select('status, public_slug')
    .eq('property_id', propertyId)
    .maybeSingle()

  const fila = data as { status?: string; public_slug?: string | null } | null
  return {
    publicada: fila?.status === 'published' && !!fila.public_slug,
    slug: fila?.public_slug ?? null,
  }
}

/** Los datos de la propiedad que necesita la descripción. Nunca el precio. */
async function datosParaDescripcion(propertyId: string): Promise<DatosDescripcion> {
  const { data } = await admin()
    .from('properties')
    .select('property_type, operation_type, neighborhood, rooms, bedrooms, bathrooms, garages, covered_area, amenities')
    .eq('id', propertyId)
    .maybeSingle()
  return (data ?? {}) as DatosDescripcion
}

export async function crearReel(a: {
  propertyId: string
  creadoPor: string
  origen: 'subido' | 'existente'
  videoUrl?: string | null
  igMediaId?: string | null
  palabraClave?: string | null
  descripcion?: string | null
}): Promise<FilaReel> {
  // Para uno subido, si el asesor todavía no escribió nada, se le ofrece una
  // descripción armada con los datos de la propiedad. Para uno ya publicado no:
  // su descripción ya está en Instagram y no se puede cambiar desde acá.
  let descripcion = a.descripcion ?? ''
  if (!descripcion && a.origen === 'subido') {
    descripcion = armarDescripcionReel(await datosParaDescripcion(a.propertyId), a.palabraClave ?? '')
  }

  const { data, error } = await admin()
    .from('property_reels')
    .insert({
      property_id: a.propertyId,
      created_by: a.creadoPor,
      origen: a.origen,
      video_url: a.videoUrl ?? null,
      ig_media_id: a.igMediaId ?? null,
      // Un reel enganchado YA está publicado en Instagram: nace en ese estado,
      // no en borrador, o el cron intentaría publicarlo de nuevo.
      estado: a.origen === 'existente' ? 'publicado' : 'borrador',
      publicado_en: a.origen === 'existente' ? new Date().toISOString() : null,
      descripcion,
      palabra_clave: a.palabraClave?.trim() || null,
    })
    .select('*')
    .single()

  if (error) {
    // El UNIQUE de ig_media_id es lo que impide enganchar dos veces el mismo aviso.
    if (error.code === '23505') {
      throw new Error('Ese reel ya está enganchado a una propiedad.')
    }
    throw new Error(`No se pudo crear el reel: ${error.message}`)
  }
  return data as unknown as FilaReel
}

export async function obtenerReel(reelId: string, propertyId: string): Promise<FilaReel | null> {
  const { data } = await admin()
    .from('property_reels')
    .select('*')
    // El property_id va en la consulta a propósito: sin él, conociendo un id de
    // reel se podría editar el de otra propiedad pasando el permiso de la propia.
    .eq('id', reelId)
    .eq('property_id', propertyId)
    .maybeSingle()
  return (data as unknown as FilaReel) ?? null
}

export async function actualizarReel(
  reelId: string,
  propertyId: string,
  cambios: CamposEditablesReel,
): Promise<FilaReel> {
  const limpios = camposEditables(cambios)

  // Encender la automatización marca DESDE CUÁNDO. Es lo que hace que los
  // comentarios viejos no se toquen: sin esta marca, enganchar un reel con 33
  // comentarios le escribiría a los 33.
  if (limpios.automatizacion_activa === true) {
    const actual = await obtenerReel(reelId, propertyId)
    if (actual && !actual.automatizacion_activa) {
      limpios.automatizacion_desde = new Date().toISOString()
    }
  }

  const { data, error } = await admin()
    .from('property_reels')
    .update({ ...limpios, updated_at: new Date().toISOString() })
    .eq('id', reelId)
    .eq('property_id', propertyId)
    .select('*')
    .single()

  if (error) throw new Error(`No se pudo guardar: ${error.message}`)
  return data as unknown as FilaReel
}

export async function borrarReel(reelId: string, propertyId: string): Promise<void> {
  const { error } = await admin()
    .from('property_reels')
    .delete()
    .eq('id', reelId)
    .eq('property_id', propertyId)
  if (error) throw new Error(`No se pudo borrar: ${error.message}`)
}

/**
 * Deja el reel en la cola. NO llama a Instagram: publicar tarda minutos y el
 * request se cortaría por el límite de tiempo de Netlify.
 */
export async function pedirPublicacion(
  reelId: string,
  propertyId: string,
  programadoPara: string | null,
): Promise<FilaReel> {
  const { data, error } = await admin()
    .from('property_reels')
    .update({
      estado: 'programado',
      programado_para: programadoPara ?? new Date().toISOString(),
      // Se limpia el error anterior: si esto es un reintento, dejar el mensaje
      // viejo haría que el asesor crea que volvió a fallar.
      ultimo_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reelId)
    .eq('property_id', propertyId)
    .select('*')
    .single()

  if (error) throw new Error(`No se pudo programar la publicación: ${error.message}`)
  return data as unknown as FilaReel
}

export async function cancelarProgramacion(reelId: string, propertyId: string): Promise<FilaReel> {
  const { data, error } = await admin()
    .from('property_reels')
    .update({ estado: 'borrador', programado_para: null, updated_at: new Date().toISOString() })
    .eq('id', reelId)
    .eq('property_id', propertyId)
    .select('*')
    .single()

  if (error) throw new Error(`No se pudo cancelar: ${error.message}`)
  return data as unknown as FilaReel
}

/** Los contadores de cada reel, en UNA consulta para toda la lista. */
export async function resumenDeReels(reelIds: string[]): Promise<Record<string, ResumenReel>> {
  const vacio: Record<string, ResumenReel> = {}
  if (reelIds.length === 0) return vacio

  const { data } = await admin()
    .from('reel_comentarios')
    .select('reel_id, coincide, dm_enviado_en, boton_tocado_en')
    .in('reel_id', reelIds)

  const filas = (data ?? []) as Array<{
    reel_id: string
    coincide: boolean
    dm_enviado_en: string | null
    boton_tocado_en: string | null
  }>

  for (const id of reelIds) {
    vacio[id] = { coincidencias: 0, privadosEnviados: 0, botonesTocados: 0 }
  }
  for (const fila of filas) {
    const resumen = vacio[fila.reel_id]
    if (!resumen) continue
    if (fila.coincide) resumen.coincidencias++
    if (fila.dm_enviado_en) resumen.privadosEnviados++
    if (fila.boton_tocado_en) resumen.botonesTocados++
  }
  return vacio
}
