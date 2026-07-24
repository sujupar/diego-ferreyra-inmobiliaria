'use client'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { MlAttributesResponse, MlDraft, MlListing, MlPreviewProperty } from './types'

interface PreviewResponse {
  property: MlPreviewProperty
  payload: unknown | null
  validation: { ok: boolean; errors: string[]; warnings: string[] }
  listing: MlListing | null
}

export function useMlPublishDraft(propertyId: string) {
  const [loading, setLoading] = useState(true)
  const [property, setProperty] = useState<MlPreviewProperty | null>(null)
  const [attrs, setAttrs] = useState<MlAttributesResponse | null>(null)
  const [listing, setListing] = useState<MlListing | null>(null)
  const [validation, setValidation] = useState<PreviewResponse['validation']>({ ok: false, errors: [], warnings: [] })
  const [draft, setDraft] = useState<MlDraft | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [prevR, attrR] = await Promise.all([
        fetch(`/api/properties/${propertyId}/ml-preview`),
        fetch(`/api/properties/${propertyId}/ml-attributes`),
      ])
      if (!prevR.ok) throw new Error('No se pudo cargar el preview')
      const prev = (await prevR.json()) as PreviewResponse
      const attrJson = attrR.ok ? ((await attrR.json()) as MlAttributesResponse) : null
      setProperty(prev.property)
      setListing(prev.listing)
      setValidation(prev.validation)
      setAttrs(attrJson)
      setDraft({
        photos: prev.property.photos ?? [],
        videoUrl: prev.property.video_url,
        tour3dUrl: prev.property.tour_3d_url,
        mediaChoice: attrJson?.mediaChoice ?? (prev.property.video_url ? 'video' : prev.property.tour_3d_url ? 'tour' : 'none'),
        mlAttributes: attrJson?.prefill ?? {},
        listingType: attrJson?.listingTypeSelected ?? 'free',
        title: prev.property.title ?? '',
        description: prev.property.description ?? '',
        askingPrice: prev.property.asking_price,
        latitude: prev.property.latitude,
        longitude: prev.property.longitude,
        address: prev.property.address,
        geoConfidence: undefined,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [propertyId])

  useEffect(() => {
    load()
  }, [load])

  const patch = useCallback((p: Partial<MlDraft>) => setDraft(d => (d ? { ...d, ...p } : d)), [])

  /** Persiste el draft en el server y devuelve la validation recalculada. */
  const save = useCallback(async (): Promise<boolean> => {
    if (!draft) return false
    const r = await fetch(`/api/properties/${propertyId}/ml-preview`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: draft.title,
        description: draft.description,
        photos: draft.photos,
        asking_price: draft.askingPrice,
        videoUrl: draft.videoUrl,
        tour3dUrl: draft.tour3dUrl,
        latitude: draft.latitude,
        longitude: draft.longitude,
        address: draft.address,
        geoConfidence: draft.geoConfidence,
        mlAttributes: draft.mlAttributes,
        mediaChoice: draft.mediaChoice,
        listingType: draft.listingType,
      }),
    })
    const j = (await r.json()) as { validation?: PreviewResponse['validation']; error?: string }
    if (!r.ok) {
      toast.error(j.error ?? 'Error al guardar')
      return false
    }
    if (j.validation) setValidation(j.validation)
    return true
  }, [draft, propertyId])

  return { loading, property, attrs, listing, validation, draft, patch, save, reload: load }
}
