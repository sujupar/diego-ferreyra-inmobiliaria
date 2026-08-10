'use client'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { leerJson } from '../leer-json'
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
  /**
   * Por qué guardamos el motivo y no solo el `null`: cuando /ml-attributes
   * fallaba, el wizard mostraba "no se pudieron traer los campos, se publicará
   * con los datos básicos" — una frase que era mentira y que además dejaba
   * avanzar. El asesor llegaba hasta Publicar y ahí sí fallaba, con un JSON de
   * ML incomprensible. El motivo real viaja hasta la pantalla.
   */
  const [attrsError, setAttrsError] = useState<string | null>(null)
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

      let attrJson: MlAttributesResponse | null = null
      let attrErr: string | null = null
      if (attrR.ok) {
        attrJson = (await attrR.json()) as MlAttributesResponse
      } else {
        // El body puede no ser JSON (p. ej. una página de error 504 del gateway):
        // leerlo como texto y recién ahí intentar parsearlo.
        const cuerpo = await attrR.text().catch(() => '')
        try {
          attrErr = (JSON.parse(cuerpo) as { error?: string }).error ?? null
        } catch { /* no era JSON */ }
        attrErr ??= attrR.status === 504
          ? 'MercadoLibre tardó demasiado en responder. Probá de nuevo en un minuto.'
          : `No se pudieron traer los campos de MercadoLibre (error ${attrR.status}).`
      }

      setProperty(prev.property)
      setListing(prev.listing)
      setValidation(prev.validation)
      setAttrs(attrJson)
      setAttrsError(attrErr)
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

  /**
   * Persiste el draft en el server y devuelve la validation recalculada.
   *
   * NUNCA tira: el que la llama es el botón "Siguiente", que apaga su spinner
   * mirando el booleano. Un error de red o una página HTML de error del gateway
   * (este PATCH le pide los atributos de la categoría a MercadoLibre y con el
   * caché frío puede pasarse del tiempo máximo) salen por acá como `false` con
   * su toast — no como una excepción que deje el botón trabado en "Guardando…".
   */
  const save = useCallback(async (): Promise<boolean> => {
    if (!draft) return false
    try {
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
      const j = await leerJson<{ validation?: PreviewResponse['validation'] }>(r)
      if (!r.ok || j.error) {
        toast.error(j.error ?? 'Error al guardar')
        return false
      }
      if (j.validation) setValidation(j.validation)
      return true
    } catch (err) {
      // El fetch ni siquiera llegó (conexión caída, request abortado).
      toast.error(err instanceof Error && err.message ? err.message : 'No se pudo guardar. Revisá tu conexión.')
      return false
    }
  }, [draft, propertyId])

  return { loading, property, attrs, attrsError, listing, validation, draft, patch, save, reload: load }
}
