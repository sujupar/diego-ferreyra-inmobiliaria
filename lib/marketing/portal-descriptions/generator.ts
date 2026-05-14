/**
 * Generador de descripciones para portales usando un proveedor AI
 * (DeepSeek por default, OpenAI fallback automático según env).
 *
 * System prompt: "GPT Portales" de Diego (ver system-prompt.ts).
 */
import type { Property } from '@/lib/portals/types'
import { chatCompletion } from '@/lib/ai/chat-client'
import { PORTAL_DESCRIPTION_SYSTEM_PROMPT } from './system-prompt'

export interface GeneratedDescription {
  title: string
  subtitle: string
  body: string
}

export interface GenerateInput {
  property: Property
  buyerProfile?: string
  extraNotes?: string
}

const TIPOLOGIA_MAP: Record<string, string> = {
  casa: 'CASA',
  departamento: 'DEPARTAMENTO',
  depto: 'DEPARTAMENTO',
  ph: 'PH',
  oficina: 'DEPARTAMENTO',
  local: 'DEPARTAMENTO',
  terreno: 'CASA',
}

function propertyTypeToTipologia(type: string): string {
  const lower = (type || '').toLowerCase()
  return TIPOLOGIA_MAP[lower] ?? 'DEPARTAMENTO'
}

function buildUserPayload(input: GenerateInput): string {
  const p = input.property
  const tipologia = propertyTypeToTipologia(p.property_type)
  const amenities = Array.isArray(p.amenities) ? (p.amenities as string[]) : []

  return [
    `# Datos de la propiedad`,
    `Tipología: ${tipologia} (raw: ${p.property_type ?? 'no especificado'})`,
    `Operación: ${p.operation_type || 'venta'}`,
    `Dirección: ${p.address}`,
    `Barrio: ${p.neighborhood}`,
    `Ciudad: ${p.city || 'CABA'}`,
    p.postal_code ? `CP: ${p.postal_code}` : null,
    p.latitude && p.longitude ? `Coords: ${p.latitude}, ${p.longitude}` : null,
    ``,
    `# Precio y comerciales`,
    `Precio publicación: ${p.asking_price} ${p.currency}`,
    p.expensas ? `Expensas: ARS ${p.expensas}` : 'Expensas: no especificadas',
    ``,
    `# Características`,
    p.rooms ? `Ambientes: ${p.rooms}` : null,
    p.bedrooms ? `Dormitorios: ${p.bedrooms}` : null,
    p.bathrooms ? `Baños: ${p.bathrooms}` : null,
    p.garages ? `Cocheras: ${p.garages}` : null,
    p.covered_area ? `Superficie cubierta: ${p.covered_area} m²` : null,
    p.total_area ? `Superficie total: ${p.total_area} m²` : null,
    p.floor != null ? `Piso: ${p.floor}` : null,
    p.age != null ? `Antigüedad: ${p.age} años` : null,
    amenities.length > 0 ? `Amenities: ${amenities.join(', ')}` : null,
    p.video_url ? `Video: ${p.video_url}` : null,
    p.tour_3d_url ? `Tour 3D: ${p.tour_3d_url}` : null,
    ``,
    input.buyerProfile ? `# Comprador ideal\n${input.buyerProfile}` : null,
    input.extraNotes ? `# Notas adicionales del asesor\n${input.extraNotes}` : null,
    p.description
      ? `# Descripción manual previa (referencia, podés mejorarla)\n${p.description}`
      : null,
    ``,
    `# Tarea`,
    `Generá el title, subtitle y body para esta propiedad siguiendo TODAS las reglas del system prompt. Devolvé solo el JSON.`,
  ]
    .filter(Boolean)
    .join('\n')
}

export async function generatePortalDescription(
  input: GenerateInput,
): Promise<GeneratedDescription> {
  const userMessage = buildUserPayload(input)

  const res = await chatCompletion({
    messages: [
      { role: 'system', content: PORTAL_DESCRIPTION_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.7,
    jsonMode: true,
  })

  let parsed: unknown
  try {
    parsed = JSON.parse(res.content)
  } catch {
    throw new Error(`${res.provider} devolvió JSON inválido: ${res.content.slice(0, 200)}`)
  }

  const result = parsed as Partial<GeneratedDescription>
  if (!result.title || !result.subtitle || !result.body) {
    throw new Error('JSON incompleto: faltan title/subtitle/body')
  }
  return {
    title: String(result.title).trim(),
    subtitle: String(result.subtitle).trim(),
    body: String(result.body).trim(),
  }
}
