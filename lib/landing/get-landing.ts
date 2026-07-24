/**
 * E1.2 — Lectura de la landing publicada de una propiedad (para /p/[slug]).
 *
 * Usa admin client (service role) porque la landing pública se sirve sin sesión
 * — igual que getPropertyBySlug. Devuelve el documento validado con Zod o null
 * (→ el caller cae al fallback legacy). Defensivo ante la ventana de despliegue:
 * si la tabla no existe todavía, no rompe, devuelve null.
 */
import { createClient } from '@supabase/supabase-js'
import { safeParseLandingDocument, type LandingDocument } from './schema'

// Cliente SIN el genérico <Database>: la tabla property_landings todavía no está
// en types/database.types.ts (la CLI de Supabase no conecta para regenerar). El
// resultado se castea a la forma esperada abajo. Mismo criterio que otros
// accesos del repo a tablas nuevas.
function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

interface LandingRow {
  content: unknown
  template_id: string
  funnel_type: 'venta_propiedad' | 'alto_valor' | null
  status: string
}

export interface PublishedLanding {
  document: LandingDocument
  templateId: string
  funnelType: 'venta_propiedad' | 'alto_valor' | null
}

/**
 * Devuelve la landing PUBLICADA de la propiedad, o null si no hay / no valida /
 * la tabla no existe. La tabla `property_landings` puede no estar todavía en la
 * ventana de deploy → cualquier error se traga y devuelve null (fallback legacy).
 */
export async function getPublishedLanding(propertyId: string): Promise<PublishedLanding | null> {
  try {
    const supabase = getAdmin()
    const { data, error } = await supabase
      .from('property_landings')
      .select('content, template_id, funnel_type, status')
      .eq('property_id', propertyId)
      .eq('status', 'published')
      .maybeSingle()

    if (error || !data) return null
    const row = data as unknown as LandingRow

    const document = safeParseLandingDocument(row.content)
    if (!document) return null

    return {
      document,
      templateId: row.template_id,
      funnelType: row.funnel_type ?? null,
    }
  } catch {
    // Tabla inexistente en la ventana de deploy, o cualquier fallo → fallback.
    return null
  }
}
