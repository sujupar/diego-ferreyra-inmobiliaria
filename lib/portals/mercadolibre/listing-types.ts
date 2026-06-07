import { mlFetch } from './client'

export interface AvailableListingType {
  id: string
  name: string
  remaining: number | null
}

interface MlAvailableResponse {
  available?: { id: string; name: string; remaining_listings: number | null }[]
}

// Costo/exposición ascendente: gratis primero. Para elegir el default más barato.
const TIER_RANK: Record<string, number> = {
  free: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
  gold_special: 4,
  gold_premium: 5,
  gold_pro: 6,
}

/**
 * Tipos de publicación REALMENTE disponibles para la cuenta en esa categoría.
 * ML los expone por categoría: una cuenta profesional puede tener solo `silver`
 * para departamentos/casas (slots de su plan) y `free` para PH, por ejemplo.
 * Devuelve ordenados de más barato a más caro (free primero).
 */
export async function fetchAvailableListingTypes(categoryId: string): Promise<AvailableListingType[]> {
  const me = await mlFetch<{ id: number }>('/users/me')
  const res = await mlFetch<MlAvailableResponse>(
    `/users/${me.id}/available_listing_types?category_id=${categoryId}`,
  )
  const list = (res.available ?? []).map(a => ({
    id: a.id,
    name: a.name,
    remaining: a.remaining_listings,
  }))
  list.sort((a, b) => (TIER_RANK[a.id] ?? 99) - (TIER_RANK[b.id] ?? 99))
  return list
}
