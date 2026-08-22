/**
 * Tipo de propiedad — catálogo canónico + labels + validación.
 * Es un dato que puede quedar mal cargado (afecta el texto de los anuncios de campaña,
 * ej. "Departamento" vs "Casa"), por eso se puede editar desde la ficha (2026-08-20).
 * El overlay de anuncios normaliza estos valores en `normalizePropertyTypeLabel`.
 */
export const PROPERTY_TYPES = [
  'departamento',
  'casa',
  'ph',
  'monoambiente',
  'terreno',
  'local',
  'oficina',
  'otro',
] as const

export type PropertyType = (typeof PROPERTY_TYPES)[number]

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  departamento: 'Departamento',
  casa: 'Casa',
  ph: 'PH',
  monoambiente: 'Monoambiente',
  terreno: 'Terreno',
  local: 'Local comercial',
  oficina: 'Oficina',
  otro: 'Otro',
}

export function isPropertyType(v: unknown): v is PropertyType {
  return typeof v === 'string' && (PROPERTY_TYPES as readonly string[]).includes(v)
}

/** Label para mostrar; si el valor no está en el catálogo, capitaliza la 1ra letra. */
export function propertyTypeLabel(v: string | null | undefined): string {
  if (isPropertyType(v)) return PROPERTY_TYPE_LABELS[v]
  const s = (v ?? '').toString()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'
}
