/**
 * Bridge entre el wizard Meta Ads y el sistema existente de descripciones
 * para portales.
 *
 * Filosofía: la descripción para portales (ML/AP/ZP) es UN INSUMO valioso para
 * el análisis de la propiedad — está pensada para vender al mismo tipo de
 * comprador. Si ya existe (la propiedad se publicó), la reusamos. Si no,
 * llamamos al sistema actual para generarla.
 *
 * NO usamos esta descripción directamente como copy del ad — solo como
 * contexto para que Gemini analice mejor la propiedad y genere mejores
 * avatares y copies.
 */
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type { Property } from '@/lib/portals/types'
import { generatePortalDescription } from './portal-descriptions/generator'

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export interface BridgedDescription {
  source: 'portal_published' | 'portal_generated_now' | 'property_description' | 'fallback'
  title: string | null
  subtitle: string | null
  body: string
  /** Si vino de un portal, cuál */
  portal?: 'mercadolibre' | 'argenprop' | 'zonaprop' | null
}

/**
 * Devuelve una descripción rica de la propiedad, en este orden de preferencia:
 *  1. Si la propiedad tiene `description` (campo propio) rica (>200 chars), usar esa.
 *  2. Si hay una publicación activa en algún portal con descripción guardada,
 *     intentar recuperarla del API del portal (futuro — por ahora reusa el
 *     campo `description` igual).
 *  3. Si no hay descripción, llamar al generator de portales para crear una
 *     ahora (solo como insumo del análisis Meta, no la guardamos en DB).
 *  4. Fallback: armar una descripción mínima con los datos básicos.
 */
export async function getOrGenerateBridgedDescription(
  property: Property,
): Promise<BridgedDescription> {
  // Caso 1: la propiedad tiene su propia descripción rica
  if (property.description && property.description.length >= 200) {
    return {
      source: 'property_description',
      title: property.title ?? null,
      subtitle: null,
      body: property.description,
      portal: null,
    }
  }

  // Caso 2: revisar si hay listing publicado y si trae descripción del portal.
  // Por ahora solo chequeamos MercadoLibre porque AP/ZP son por email (sin API).
  const supabase = getAdmin()
  const { data: mlListing } = await supabase
    .from('property_listings')
    .select('external_id, status')
    .eq('property_id', property.id)
    .eq('portal', 'mercadolibre')
    .in('status', ['published', 'paused'])
    .maybeSingle()

  if (mlListing?.external_id) {
    // Futuro: traer descripción desde la API de ML. Por ahora solo marcar la fuente.
    if (property.description && property.description.length > 100) {
      return {
        source: 'portal_published',
        title: property.title ?? null,
        subtitle: null,
        body: property.description,
        portal: 'mercadolibre',
      }
    }
  }

  // Caso 3: generar al vuelo con el sistema actual de portales (no guarda en DB)
  try {
    const generated = await generatePortalDescription({ property })
    return {
      source: 'portal_generated_now',
      title: generated.title,
      subtitle: generated.subtitle,
      body: generated.body,
      portal: null,
    }
  } catch (err) {
    console.warn('[portal-description-bridge] generación falló, usando fallback:', err)
  }

  // Caso 4: fallback mínimo
  const fallbackBody = [
    `${property.property_type} en ${property.neighborhood}`,
    property.rooms ? `${property.rooms} ambientes` : null,
    property.bedrooms ? `${property.bedrooms} dormitorios` : null,
    property.bathrooms ? `${property.bathrooms} baños` : null,
    property.covered_area ? `${property.covered_area} m² cubiertos` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    source: 'fallback',
    title: property.title ?? null,
    subtitle: null,
    body: property.description ?? fallbackBody,
    portal: null,
  }
}
