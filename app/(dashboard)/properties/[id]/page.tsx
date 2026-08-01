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

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Borrador', color: 'bg-gray-400' },
  pending_docs: { label: 'Pendiente Documentos', color: 'bg-amber-500' },
  pending_photos: { label: 'Pendiente Fotos', color: 'bg-orange-500' },
  pending_review: { label: 'En Revisión Legal', color: 'bg-purple-500' },
  approved: { label: 'Captación Completa', color: 'bg-green-500' },
  rejected: { label: 'Rechazada', color: 'bg-red-500' },
  active: { label: 'Activa', color: 'bg-emerald-600' },
  descartada: { label: 'Descartada', color: 'bg-slate-500' },
}

interface PropertyData {
  id: string
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

  const tabs = visibleTabs({ role: userInfo?.role, status: property?.status ?? '' })

  // La pestaña vive en la URL (?tab=…) para que recargar no vuelva al principio
  // y se pueda mandar un link directo. Se lee con window.location en vez de
  // useSearchParams: ese hook obliga a envolver la página en <Suspense>.
  useEffect(() => {
    if (!property || !userInfo) return
    const fromUrl = new URLSearchParams(window.location.search).get('tab')
    setTab(resolveTab(fromUrl, visibleTabs({ role: userInfo.role, status: property.status })))
  }, [property, userInfo])

  function goToTab(next: TabKey) {
    setTab(next)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', next)
    window.history.replaceState(null, '', url.toString())
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleUpdateStatus(newStatus: string) {
    setSubmitting(true)
    try {
      await fetch(`/api/properties/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      await fetchProperty()
    } catch {
      alert('Error al actualizar estado')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDiscard() {
    if (!confirm(`¿Descartar la propiedad "${property?.address}"?\n\nQueda guardada en el sistema (status="Descartada") y se puede restaurar cambiándola de estado, pero no avanza más en el flujo de captación.`)) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/properties/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'descartada' }),
      })
      if (!res.ok) throw new Error('Error')
      await fetchProperty()
    } catch {
      alert('Error al descartar')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRestore() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/properties/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'draft' }),
      })
      if (!res.ok) throw new Error('Error')
      await fetchProperty()
    } catch {
      alert('Error al restaurar')
    } finally {
      setSubmitting(false)
    }
  }

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

  const statusInfo = (property.status === 'pending_review' && property.legal_status === 'approved')
    ? { label: 'Pendiente Fotos', color: 'bg-amber-500' }
    : STATUS_LABELS[property.status] || { label: property.status, color: 'bg-gray-400' }

  const isAbogado = userInfo?.role === 'abogado'
  const canHardDelete = userInfo?.role === 'admin' || userInfo?.role === 'dueno'
  const photos = property.photos || []
  const plans = property.plans || []
  const documents = Array.isArray(property.documents) ? property.documents : []

  const step = nextStep({
    role: userInfo?.role,
    status: property.status,
    legalStatus: property.legal_status,
    legalNotes: property.legal_notes,
    photosCount: photos.length,
    documentsCount: documents.length,
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

      <PropertyHeroGallery
        photos={photos}
        address={property.address}
        plansCount={plans.length}
        hasVideo={!!property.video_file_url}
        hasTour={!!property.tour_3d_url}
        onGoToMedia={isAbogado ? undefined : () => goToTab('multimedia')}
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
      />

      <PropertyKeyStats stats={buildKeyStats(property)} />

      <PropertyNextStepBanner
        step={step}
        submitting={submitting}
        onGoToTab={goToTab}
        onSubmitReview={() => handleUpdateStatus('pending_review')}
        details={ghlDetails}
      />

      <PropertyTabsNav tabs={tabs} active={tab} onChange={goToTab} />

      <div className="pt-2">
        {tab === 'propiedad' && <OverviewTab property={property} isAbogado={!!isAbogado} />}

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
            status={property.status}
            legalStatus={property.legal_status}
            legalNotes={property.legal_notes}
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
          isDiscarded={property.status === 'descartada'}
          canHardDelete={canHardDelete}
          submitting={submitting}
          onDiscard={handleDiscard}
          onRestore={handleRestore}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
