/**
 * BRIDGE publicación → routing de consultas. Registra el aviso publicado en
 * portal_property_map (external_code + external_url + dirección/título para el
 * fallback fuzzy + assigned_to de la propiedad). Así, cuando llega una consulta
 * de ESE aviso, el matcher la rutea al asesor correcto.
 *
 * Idempotente por propiedad y portal vía `notes` ("property:<id>"): borra la
 * fila anterior antes de insertar la nueva, porque una republicación (ML plan B,
 * Argenprop por cambio de tipo) genera un id de aviso nuevo.
 *
 * Antes vivía copiado en ml-publish y ap-publish (idénticos salvo el portal);
 * ahora lo usan también las rutas de sincronización con la ficha.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

type PropertyRow = Database['public']['Tables']['properties']['Row']

// portal_property_map es del sistema de consultas y no está en database.types:
// el cliente tipado no acepta su nombre, de ahí la vista "suelta" (mismo
// cast que tenían las dos copias originales).
type LooseQuery = {
  delete: () => LooseQuery
  insert: (row: Record<string, unknown>) => Promise<unknown>
  eq: (column: string, value: unknown) => LooseQuery & Promise<unknown>
}

export async function syncPortalPropertyMap(
  supabase: SupabaseClient<Database>,
  portal: 'mercadolibre' | 'argenprop',
  property: Pick<PropertyRow, 'id' | 'address' | 'neighborhood' | 'title' | 'assigned_to'>,
  externalId: string,
  externalUrl: string,
): Promise<void> {
  const noteKey = `property:${property.id}`
  const db = supabase as unknown as { from: (table: string) => LooseQuery }
  await db.from('portal_property_map').delete().eq('portal', portal).eq('notes', noteKey)
  await db.from('portal_property_map').insert({
    portal,
    external_code: externalId,
    external_url: externalUrl,
    address: property.address,
    neighborhood: property.neighborhood,
    title: property.title ?? property.address,
    assigned_to: property.assigned_to,
    property_id: property.id,
    active: true,
    notes: noteKey,
  })
}
