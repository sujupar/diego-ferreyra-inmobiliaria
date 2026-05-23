/**
 * Dataset de barrios CABA + GBA Norte con lat/lng centrales y clustering
 * socioeconómico para el preset geográfico "Barrios con perfil parecido".
 *
 * Coordenadas: centro aproximado del barrio (no de un punto turístico).
 * Cluster: criterio socioeconómico subjetivo basado en valor promedio del
 * m² y demanda histórica. Ajustar con datos reales del cliente cuando
 * estén disponibles.
 */

export type NeighborhoodCluster = 'premium' | 'alto' | 'medio_alto' | 'medio'

export interface NeighborhoodPoint {
  name: string
  cluster: NeighborhoodCluster
  lat: number
  lng: number
  /** Es CABA o GBA Norte */
  zone: 'caba' | 'gba_norte'
}

export const CABA_NEIGHBORHOODS: NeighborhoodPoint[] = [
  // === PREMIUM (mayor valor m², demanda muy alta) ===
  { name: 'Recoleta', cluster: 'premium', lat: -34.5879, lng: -58.3974, zone: 'caba' },
  { name: 'Puerto Madero', cluster: 'premium', lat: -34.6118, lng: -58.3625, zone: 'caba' },
  { name: 'Núñez', cluster: 'premium', lat: -34.5444, lng: -58.4612, zone: 'caba' },
  { name: 'Belgrano', cluster: 'premium', lat: -34.5612, lng: -58.4569, zone: 'caba' },
  { name: 'Palermo Chico', cluster: 'premium', lat: -34.5780, lng: -58.4080, zone: 'caba' },
  { name: 'Olivos', cluster: 'premium', lat: -34.5103, lng: -58.4910, zone: 'gba_norte' },
  { name: 'Acassuso', cluster: 'premium', lat: -34.4920, lng: -58.4920, zone: 'gba_norte' },
  { name: 'San Isidro', cluster: 'premium', lat: -34.4720, lng: -58.5080, zone: 'gba_norte' },

  // === ALTO (demanda alta, m² alto) ===
  { name: 'Palermo', cluster: 'alto', lat: -34.5810, lng: -58.4290, zone: 'caba' },
  { name: 'Palermo Soho', cluster: 'alto', lat: -34.5895, lng: -58.4297, zone: 'caba' },
  { name: 'Palermo Hollywood', cluster: 'alto', lat: -34.5840, lng: -58.4385, zone: 'caba' },
  { name: 'Caballito', cluster: 'alto', lat: -34.6195, lng: -58.4395, zone: 'caba' },
  { name: 'Villa Urquiza', cluster: 'alto', lat: -34.5749, lng: -58.4878, zone: 'caba' },
  { name: 'Colegiales', cluster: 'alto', lat: -34.5740, lng: -58.4480, zone: 'caba' },
  { name: 'Saavedra', cluster: 'alto', lat: -34.5530, lng: -58.4853, zone: 'caba' },
  { name: 'Vicente Lopez', cluster: 'alto', lat: -34.5300, lng: -58.4800, zone: 'gba_norte' },
  { name: 'Martinez', cluster: 'alto', lat: -34.4880, lng: -58.5060, zone: 'gba_norte' },

  // === MEDIO ALTO ===
  { name: 'Villa Crespo', cluster: 'medio_alto', lat: -34.5985, lng: -58.4416, zone: 'caba' },
  { name: 'Almagro', cluster: 'medio_alto', lat: -34.6107, lng: -58.4203, zone: 'caba' },
  { name: 'Chacarita', cluster: 'medio_alto', lat: -34.5887, lng: -58.4528, zone: 'caba' },
  { name: 'Coghlan', cluster: 'medio_alto', lat: -34.5618, lng: -58.4751, zone: 'caba' },
  { name: 'Villa del Parque', cluster: 'medio_alto', lat: -34.6051, lng: -58.4885, zone: 'caba' },
  { name: 'Villa Devoto', cluster: 'medio_alto', lat: -34.6020, lng: -58.5114, zone: 'caba' },
  { name: 'Florida', cluster: 'medio_alto', lat: -34.5170, lng: -58.4960, zone: 'gba_norte' },

  // === MEDIO ===
  { name: 'Boedo', cluster: 'medio', lat: -34.6280, lng: -58.4180, zone: 'caba' },
  { name: 'Flores', cluster: 'medio', lat: -34.6276, lng: -58.4640, zone: 'caba' },
  { name: 'San Telmo', cluster: 'medio', lat: -34.6212, lng: -58.3729, zone: 'caba' },
  { name: 'Balvanera', cluster: 'medio', lat: -34.6094, lng: -58.4060, zone: 'caba' },
  { name: 'Monserrat', cluster: 'medio', lat: -34.6135, lng: -58.3814, zone: 'caba' },
  { name: 'Parque Patricios', cluster: 'medio', lat: -34.6360, lng: -58.4045, zone: 'caba' },
  { name: 'Boulogne', cluster: 'medio', lat: -34.4960, lng: -58.5560, zone: 'gba_norte' },
]

/**
 * Normaliza un string: lowercase + NFD + remove diacritics + remove spaces.
 * Para hacer matching robusto entre el address de la propiedad y los nombres
 * canónicos del dataset.
 */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritics
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Busca un barrio del dataset por nombre. Acepta variaciones (con/sin
 * acento, mayúsculas, espacios). Devuelve null si no encuentra match.
 */
export function findNeighborhood(name: string): NeighborhoodPoint | null {
  if (!name) return null
  const target = normalize(name)
  // Match exacto primero
  const exact = CABA_NEIGHBORHOODS.find(n => normalize(n.name) === target)
  if (exact) return exact
  // Match parcial (si la propiedad dice "Palermo Botánico", matchea Palermo)
  const partial = CABA_NEIGHBORHOODS.find(
    n => target.includes(normalize(n.name)) || normalize(n.name).includes(target),
  )
  return partial ?? null
}

/**
 * Devuelve los barrios del mismo cluster que el barrio dado.
 * Si el barrio no está en el dataset, devuelve el cluster 'medio' por default.
 * Excluye el barrio mismo del resultado (para no duplicar el pin de la propiedad).
 */
export function siblingNeighborhoods(
  name: string,
  maxResults = 6,
): NeighborhoodPoint[] {
  const found = findNeighborhood(name)
  const cluster: NeighborhoodCluster = found?.cluster ?? 'medio'
  const candidates = CABA_NEIGHBORHOODS.filter(
    n => n.cluster === cluster && (!found || n.name !== found.name),
  )
  return candidates.slice(0, maxResults)
}
