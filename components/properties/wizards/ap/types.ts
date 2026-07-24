export type ApValueType = 'string' | 'number' | 'number_unit' | 'boolean' | 'list'

export interface ApField {
  id: string
  name: string
  valueType: ApValueType
  required: boolean
  allowedValues?: { id: string; name: string }[]
  allowedUnits?: string[]
  hint?: string
}

export interface AttributeOverride {
  value_name?: string
  value_id?: string
}

export type StepId = 'images' | 'media' | 'fields' | 'description' | 'review' | 'confirm'

export interface ApPreviewProperty {
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

export interface ApAttributesResponse {
  categoryId: string
  required: ApField[]
  recommended: ApField[]
  prefill: Record<string, AttributeOverride>
  listingTypes: { id: string; label: string }[]
  listingTypeSelected: string
  mediaChoice: 'video' | 'tour' | 'none'
}

export interface ApDraft {
  photos: string[]
  videoUrl: string | null
  tour3dUrl: string | null
  mediaChoice: 'video' | 'tour' | 'none'
  apAttributes: Record<string, AttributeOverride>
  listingType: string
  title: string
  description: string
  askingPrice: number
  latitude: number | null
  longitude: number | null
  address?: string
  geoConfidence?: 'high' | 'medium' | 'low' | 'manual'
}

export interface ApListing {
  status: string
  external_id: string | null
  external_url: string | null
  last_published_at: string | null
  last_error: string | null
}
