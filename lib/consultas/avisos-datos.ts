import 'server-only'
/**
 * Lectura de los avisos sin propiedad para la hoja "Conectar avisos". Lee TODAS
 * las consultas de portal sin propiedad (no solo las del período): el número de
 * cada tarjeta tiene que coincidir con lo que se va a conectar. Hoy son ~230.
 * Sin permisos: la ruta decide antes quién puede.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { agruparAvisos, type AvisoSinPropiedad, type FilaSinPropiedad } from './avisos'

const TAMANO_PAGINA = 1000
/** 20.000 consultas sin propiedad: si se llegara acá, algo se rompió en la ingesta. */
const MAX_PAGINAS = 20

export async function avisosSinPropiedad(sb: SupabaseClient): Promise<{ avisos: AvisoSinPropiedad[]; sueltas: number }> {
  const filas: FilaSinPropiedad[] = []
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const desde = pagina * TAMANO_PAGINA
    // Orden fijo y único: paginar sin orden repite o saltea filas.
    const { data, error } = await sb
      .from('portal_inquiries')
      .select('id, portal, property_external_code, raw_subject, property_address, property_url, received_at, created_at')
      .is('property_id', null)
      .order('id', { ascending: true })
      .range(desde, desde + TAMANO_PAGINA - 1)
    if (error) throw new Error(`avisos sin propiedad: ${error.message}`)
    const lote = (data ?? []) as Record<string, unknown>[]
    for (const r of lote) {
      const texto = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null)
      filas.push({
        portal: String(r.portal ?? ''),
        codigo: texto(r.property_external_code),
        asunto: texto(r.raw_subject),
        direccion: texto(r.property_address),
        url: texto(r.property_url),
        recibida_at: String(r.received_at ?? r.created_at ?? ''),
      })
    }
    if (lote.length < TAMANO_PAGINA) return agruparAvisos(filas)
  }
  throw new Error('avisos sin propiedad: demasiadas consultas sin propiedad para leer de una vez')
}
