import type { CategoryAttribute, AttributeOverride } from '@/lib/portals/mercadolibre/category-attributes'

export type StepId = 'images' | 'media' | 'fields' | 'description' | 'review' | 'confirm'

export interface MlPreviewProperty {
  id: string
  title: string | null
  description: string | null
  photos: string[]
  asking_price: number
  currency: string
  address: string
  neighborhood: string
  city: string
  province?: string | null
  rooms: number | null
  bedrooms: number | null
  bathrooms: number | null
  covered_area: number | null
  total_area: number | null
  latitude: number | null
  longitude: number | null
  video_url: string | null
  tour_3d_url: string | null
}

export interface MlAttributesResponse {
  categoryId: string
  required: CategoryAttribute[]
  recommended: CategoryAttribute[]
  prefill: Record<string, AttributeOverride>
  listingTypes: { id: string; label: string }[]
  listingTypeSelected: string
  mediaChoice: 'video' | 'tour' | 'none'
}

export interface MlDraft {
  photos: string[]
  videoUrl: string | null
  tour3dUrl: string | null
  mediaChoice: 'video' | 'tour' | 'none'
  mlAttributes: Record<string, AttributeOverride>
  listingType: string
  title: string
  description: string
  askingPrice: number
  latitude: number | null
  longitude: number | null
  address?: string
  geoConfidence?: 'high' | 'medium' | 'low' | 'manual'
}

export interface MlListing {
  status: string
  external_id: string | null
  external_url: string | null
  last_published_at: string | null
  last_error: string | null
}
