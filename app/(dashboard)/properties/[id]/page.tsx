'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2, ArrowLeft } from 'lucide-react'
import { AddTaskDialog } from '@/components/tasks/AddTaskDialog'
import { VisitDataView } from '@/components/pipeline/VisitDataView'
import type { LegalDocsState, LegalFlags } from '@/types/legal-docs.types'
import type { FlowHistoryData } from '@/app/(dashboard)/_components/FlowHistoryCard'

import {
  buildKeyStats, ghlMissingFields, nextStep, resolveTab, visibleTabs, type TabKey,
} from '@/lib/properties/detail-view'
import { contarDocumentosCargados, etiquetaDeCaptacion } from '@/lib/properties/captacion'
import { useSubirFotos } from '@/lib/properties/use-subir-fotos'
import { PropertyHeroGallery } from '@/components/properties/detail/PropertyHeroGallery'
import { PropertyIdentityBar } from '@/components/properties/detail/PropertyIdentityBar'
import { PropertyKeyStats } from '@/components/properties/detail/PropertyKeyStats'
import { PropertyNextStepBanner } from '@/components/properties/detail/PropertyNextStepBanner'
import { PropertyTabsNav } from '@/components/properties/detail/PropertyTabsNav'
import { PropertyArchiveFooter } from '@/components/properties/detail/PropertyArchiveFooter'
import { OverviewTab } from '@/components/properties/detail/tabs/OverviewTab'
import { MediaTab } from '@/components/properties/detail/tabs/MediaTab'
import { DocsTab } from '@/components/properties/detail/tabs/DocsTab'
import { MarketingTab } from '@/components/properties/detail/tabs/MarketingTab'
import { HistoryTab, type VisitFeedback } from '@/components/properties/detail/tabs/HistoryTab'

// El badge del encabezado lo arma `etiquetaDeCaptacion`, no un mapa por
// literal: "Pendiente Documentos" era mentira desde que la documentación dejó
// de ser obligatoria (2026-08-09). Ver lib/properties/captacion.ts.

interface PropertyData {
  id: string
  /**
   * La tasación de la que nació esta ficha. `GET /api/properties/[id]` hace
   * `select('*')`, así que ya venía en la respuesta; hacía falta declararla
   * para que llegue a la pestaña Propiedad — sin esto el panel de tasación del
   * abogado nunca se monta, porque el campo llega `undefined`.
   */
  appraisal_id: string | null
  address: string
  neighborhood: string
  city: string
  property_type: string
  operation_type: string | null
  rooms: number | null
  bedrooms: number | null
  bathrooms: number | null
  garages: number | null
  covered_area: number | null
  total_area: number | null
  floor: number | null
  age: number | null
  expensas: number | null
  amenities: unknown
  description: string | null
  latitude: number | null
  longitude: number | null
  asking_price: number
  currency: string
  commission_percentage: number
  contract_start_date: string | null
  contract_end_date: string | null
  origin: string | null
  status: string
  commercial_status: string | null
  sold_price: number | null
  sold_currency: string | null
  sold_at: string | null
  /**
   * COLUMNA MUERTA. La escribía `POST /api/properties/[id]/upload`, una ruta
   * sin un solo llamador desde el rediseño; el checklist legal escribe en
   * `legal_docs` vía la RPC `merge_property_legal_doc`. Se conserva en el tipo
   * porque la API la sigue devolviendo, pero NADIE de esta ficha la lee: la
   * cuenta de documentos sale de `legal_docs`.
   */
  documents: Array<{ name: string; url: string }>
  photos: string[]
  plans: string[] | null
  video_file_url: string | null
  video_url: string | null
  tour_3d_url: string | null
  video_recorrido_url: string | null
  deliver_media: string | null
  legal_status: string
  legal_notes: string | null
  legal_reviewed_at: string | null
  legal_submitted_at: string | null
  created_at: string
  ghl_imported?: boolean
  ghl_custom_fields?: Record<string, string | null> | null
  import_source?: string | null
  legal_docs_pending?: boolean | null
  origin_pending?: boolean | null
}

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [property, setProperty] = useState<PropertyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [userInfo, setUserInfo] = useState<{ id: string; role: string } | null>(null)
  const [legalDocsData, setLegalDocsData] = useState<{ docs: LegalDocsState; flags: LegalFlags } | null>(null)
  const [flowHistory, setFlowHistory] = useState<FlowHistoryData | null>(null)
  const [feedback, setFeedback] = useState<VisitFeedback[]>([])
  const [tab, setTab] = useState<TabKey>('propiedad')

  const fetchProperty = useCallback(async () => {
    try {
      const res = await fetch(`/api/properties/${id}`)
      if (res.ok) {
        const { data } = await res.json()
        setProperty(data)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [id])

  const fetchLegalDocs = useCallback(async () => {
    try {
      const res = await fetch(`/api/properties/${id}/legal-docs`)
      if (res.ok) {
        const { data } = await res.json()
        setLegalDocsData(data)
      }
    } catch (err) {
      console.error(err)
    }
  }, [id])

  useEffect(() => { fetch('/api/auth/me').then(r => r.json()).then(setUserInfo).catch(() => {}) }, [])
  useEffect(() => { fetchProperty() }, [fetchProperty])
  useEffect(() => { fetchLegalDocs() }, [fetchLegalDocs])
  useEffect(() => {
    fetch(`/api/flow-history?propertyId=${id}`)
      .then(r => r.json()).then(({ data }) => setFlowHistory(data)).catch(() => setFlowHistory(null))
  }, [id])
  useEffect(() => {
    if (!id) return
    fetch(`/api/properties/${id}/feedback`)
      .then(r => (r.ok ? r.json() : { data: [] }))
      .then(({ data }) => setFeedback(Array.isArray(data) ? data : []))
      .catch(() => setFeedback([]))
  }, [id])

  // ARRIBA de los early returns de abajo (`loading` / `!property`): un hook que
  // quede después se saltea en esos renders y React tumba la ficha entera con
  // "Rendered fewer hooks than expected".
  const subidaDeFotos = useSubirFotos(id, fetchProperty)

  const tabs = visibleTabs({ role: userInfo?.role, status: property?.status ?? '' })

  // La pestaña vive en la URL (?tab=…) para que recargar no vuelva al principio
  // y se pueda mandar un link directo. Se lee con window.location en vez de
  // useSearchParams: ese hook obliga a envolver la página en <Suspense>.
  useEffect(() => {
    if (!property || !userInfo) return
    const fromUrl = new URLSearchParams(window.location.search).get('tab')
    setTab(resolveTab(fromUrl, visibleTabs({ role: userInfo.role, status: property.status })))
  }, [property, userInfo])

  /**
   * `destino` decide adónde queda mirando la pantalla:
   * - 'tope' (default): la barra de pestañas está arriba, así que volver al tope
   *   es lo natural cuando el propio usuario eligió la pestaña ahí.
   * - 'contenido': lo mandó un aviso de la cabecera. Ahí el tope es justamente
   *   de donde viene — hay que dejarlo mirando lo que le pidieron hacer.
   */
  function goToTab(next: TabKey, destino: 'tope' | 'contenido' = 'tope') {
    setTab(next)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', next)
    window.history.replaceState(null, '', url.toString())
    if (destino === 'contenido') {
      // El ancla es un contenedor fijo (solo cambia lo que tiene adentro), así
      // que ya existe en el DOM y no hace falta esperar al próximo render.
      document.getElementById('contenido-pestana')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
      return
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /**
   * Mandarle la documentación al abogado. Ruta propia, NO el PUT genérico: el
   * `status: 'pending_review'` de antes apagaba la propiedad entera (Difusión,
   * landing pública, consultas, recorrido) para expresar algo que solo tiene
   * que ver con el circuito legal.
   */
  async function handleEnviarARevisionLegal() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/properties/${id}/legal-submit`, { method: 'POST' })
      if (!res.ok) throw new Error('Error')
      await fetchProperty()
    } catch {
      alert('Error al enviar a revisión legal')
    } finally {
      setSubmitting(false)
    }
  }

  // Descartar y restaurar dejaron de vivir acá: ahora son estados de la tarjeta
  // "Estado de la propiedad", en la pestaña Propiedad (2026-08-06).

  async function handleDelete() {
    if (!property) return
    const confirmation = prompt(
      `Vas a ELIMINAR DEFINITIVAMENTE la propiedad "${property.address}".\n\n` +
      `Esta acción no se puede deshacer. Se borran también sus publicaciones en portales, métricas, fotos, eventos legales y revisiones.\n\n` +
      `Para confirmar, escribí ELIMINAR:`
    )
    if (confirmation !== 'ELIMINAR') return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/properties/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || 'Error al eliminar')
        setSubmitting(false)
        return
      }
      router.push('/properties')
    } catch {
      alert('Error al eliminar')
      setSubmitting(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>
  if (!property) return <div className="text-center py-20"><p>Propiedad no encontrada</p></div>

  const isAbogado = userInfo?.role === 'abogado'
  const canHardDelete = userInfo?.role === 'admin' || userInfo?.role === 'dueno'
  const photos = property.photos || []
  const plans = property.plans || []
  // De `legal_docs` (lo que escribe el checklist), NO de `properties.documents`.
  // Esa columna quedó huérfana en abril y devolvía 0 siempre, así que el envío
  // al abogado era código muerto. Ver `contarDocumentosCargados`.
  const documentosCargados = contarDocumentosCargados(legalDocsData?.docs)

  const statusInfo = etiquetaDeCaptacion({
    status: property.status,
    legalStatus: property.legal_status,
    photosCount: photos.length,
  })

  const step = nextStep({
    role: userInfo?.role,
    status: property.status,
    legalStatus: property.legal_status,
    legalNotes: property.legal_notes,
    legalSubmittedAt: property.legal_submitted_at ?? null,
    photosCount: photos.length,
    documentsCount: documentosCargados,
    ghlImported: !!property.ghl_imported,
    ghlMissing: property.ghl_imported ? ghlMissingFields(property) : [],
    importSource: property.import_source ?? null,
    legalDocsPending: !!property.legal_docs_pending,
    originPending: !!property.origin_pending,
  })

  const ghlDetails = step?.id === 'ghl' && property.ghl_custom_fields && Object.keys(property.ghl_custom_fields).length > 0
    ? (
      <details className="text-sm mt-2">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          Ver datos importados de GHL ({Object.keys(property.ghl_custom_fields).length} campos)
        </summary>
        <div className="mt-2 p-3 bg-muted/50 rounded-lg">
          <VisitDataView data={property.ghl_custom_fields} />
        </div>
      </details>
    )
    : undefined

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver
        </Button>
        <AddTaskDialog entity={{ kind: 'property', id: property.id, label: property.address }} />
      </div>

      {/*
        El selector de archivos vive ACÁ, fuera de las pestañas, y nunca se
        desmonta: cualquier botón de "Subir fotos" de la ficha lo abre con un
        `.click()` sincrónico dentro de su propio `onClick`. Metido adentro de
        una pestaña quedaría `null` para quien esté parado en otra, y diferir el
        click a un efecto pierde la activación del usuario — las dos formas
        reproducen el bug original: tocás el botón y no pasa nada.
      */}
      {/*
        El selector de archivos vive ACÁ, fuera de las pestañas, y nunca se
        desmonta: cualquier botón de "Subir fotos" de la ficha lo abre con un
        `.click()` sincrónico dentro de su propio `onClick`. Metido adentro de
        una pestaña quedaría `null` para quien esté parado en otra, y diferir el
        click a un efecto pierde la activación del usuario — las dos formas
        reproducen el bug original: tocás el botón y no pasa nada.
      */}
      <input {...subidaDeFotos.inputProps} />

      <PropertyHeroGallery
        photos={photos}
        address={property.address}
        plansCount={plans.length}
        hasVideo={!!property.video_file_url}
        hasTour={!!property.tour_3d_url}
        onSubirFotos={isAbogado ? undefined : subidaDeFotos.abrirSelector}
        subiendoFotos={subidaDeFotos.subiendo}
        progresoSubida={subidaDeFotos.progreso}
      />

      <PropertyIdentityBar
        operationType={property.operation_type}
        propertyType={property.property_type}
        address={property.address}
        neighborhood={property.neighborhood}
        city={property.city}
        price={property.asking_price}
        currency={property.currency}
        statusLabel={statusInfo.label}
        statusColor={statusInfo.color}
        showPrice={!isAbogado}
        commercialStatus={property.commercial_status}
      />

      <PropertyKeyStats stats={buildKeyStats(property)} />

      <PropertyNextStepBanner
        step={step}
        submitting={submitting}
        onGoToTab={t => goToTab(t, 'contenido')}
        onSubmitReview={handleEnviarARevisionLegal}
        onSubirFotos={subidaDeFotos.abrirSelector}
        subiendoFotos={subidaDeFotos.subiendo}
        details={ghlDetails}
      />

      <PropertyTabsNav tabs={tabs} active={tab} onChange={goToTab} />

      {/* `scroll-mt-32` deja el contenido debajo de la barra de pestañas, que es
          sticky: sin ese margen el ancla queda tapada por la propia barra. */}
      <div id="contenido-pestana" className="pt-2 scroll-mt-32">
        {tab === 'propiedad' && <OverviewTab property={property} isAbogado={!!isAbogado} onChanged={fetchProperty} />}

        {tab === 'multimedia' && (
          <MediaTab
            propertyId={property.id}
            photos={photos}
            plans={plans}
            videoFileUrl={property.video_file_url}
            tourUrl={property.tour_3d_url}
            videoRecorridoUrl={property.video_recorrido_url}
            onChanged={fetchProperty}
          />
        )}

        {tab === 'documentacion' && (
          <DocsTab
            propertyId={property.id}
            propertyType={property.property_type || ''}
            docs={legalDocsData?.docs || {}}
            flags={legalDocsData?.flags || { has_succession: false, has_divorce: false, has_powers: false, is_credit_purchase: false }}
            isAbogado={!!isAbogado}
            legalStatus={property.legal_status}
            legalSubmittedAt={property.legal_submitted_at ?? null}
            legalNotes={property.legal_notes}
            documentosCargados={documentosCargados}
            onSubmitReview={handleEnviarARevisionLegal}
            enviando={submitting}
            onUpdated={fetchLegalDocs}
            onReviewed={() => { fetchProperty(); fetchLegalDocs() }}
          />
        )}

        {tab === 'difusion' && (
          <MarketingTab
            propertyId={property.id}
            canManage={['admin', 'dueno', 'coordinador'].includes(userInfo?.role ?? '')}
            videoRecorridoUrl={property.video_recorrido_url}
            tour3dUrl={property.tour_3d_url}
            videoUrl={property.video_url}
            videoFileUrl={property.video_file_url}
            deliverMediaSaved={property.deliver_media}
          />
        )}

        {tab === 'historial' && (
          <HistoryTab propertyId={property.id} flowHistory={flowHistory} feedback={feedback} />
        )}
      </div>

      {!isAbogado && (
        <PropertyArchiveFooter
          createdAt={property.created_at}
          canHardDelete={canHardDelete}
          submitting={submitting}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
