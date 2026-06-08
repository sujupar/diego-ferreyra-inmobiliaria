'use client'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { ApAttributesResponse, ApDraft, ApListing, ApPreviewProperty } from './types'

interface PreviewResponse {
  property: ApPreviewProperty
  payload: unknown | null
  validation: { ok: boolean; errors: string[]; warnings: string[] }
  listing: ApListing | null
}

export function useApPublishDraft(propertyId: string) {
  const [loading, setLoading] = useState(true)
  const [property, setProperty] = useState<ApPreviewProperty | null>(null)
  const [attrs, setAttrs] = useState<ApAttributesResponse | null>(null)
  const [listing, setListing] = useState<ApListing | null>(null)
  const [validation, setValidation] = useState<PreviewResponse['validation']>({ ok: false, errors: [], warnings: [] })
  const [draft, setDraft] = useState<ApDraft | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [prevR, attrR] = await Promise.all([
        fetch(`/api/properties/${propertyId}/ap-preview`),
        fetch(`/api/properties/${propertyId}/ap-attributes`),
      ])
      if (!prevR.ok) throw new Error('No se pudo cargar el preview')
      const prev = (await prevR.json()) as PreviewResponse
      const attrJson = attrR.ok ? ((await attrR.json()) as ApAttributesResponse) : null
      setProperty(prev.property)
      setListing(prev.listing)
      setValidation(prev.validation)
      setAttrs(attrJson)
      setDraft({
        photos: prev.property.photos ?? [],
        videoUrl: prev.property.video_url,
        tour3dUrl: prev.property.tour_3d_url,
        mediaChoice: attrJson?.mediaChoice ?? (prev.property.video_url ? 'video' : prev.property.tour_3d_url ? 'tour' : 'none'),
        apAttributes: attrJson?.prefill ?? {},
        listingType: attrJson?.listingTypeSelected ?? 'estandar',
        title: prev.property.title ?? '',
        description: prev.property.description ?? '',
        askingPrice: prev.property.asking_price,
        latitude: prev.property.latitude,
        longitude: prev.property.longitude,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [propertyId])

  useEffect(() => { load() }, [load])

  const patch = useCallback((p: Partial<ApDraft>) => setDraft(d => (d ? { ...d, ...p } : d)), [])

  const save = useCallback(async (): Promise<boolean> => {
    if (!draft) return false
    const r = await fetch(`/api/properties/${propertyId}/ap-preview`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: draft.title, description: draft.description, photos: draft.photos,
        asking_price: draft.askingPrice, videoUrl: draft.videoUrl, tour3dUrl: draft.tour3dUrl,
        latitude: draft.latitude, longitude: draft.longitude,
        apAttributes: draft.apAttributes, mediaChoice: draft.mediaChoice, listingType: draft.listingType,
      }),
    })
    const j = (await r.json()) as { validation?: PreviewResponse['validation']; error?: string }
    if (!r.ok) { toast.error(j.error ?? 'Error al guardar'); return false }
    if (j.validation) setValidation(j.validation)
    return true
  }, [draft, propertyId])

  return { loading, property, attrs, listing, validation, draft, patch, save, reload: load }
}
