'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Image from 'next/image'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  Pencil,
  Rocket,
  ArrowLeft,
  ArrowRight,
  GripVertical,
  ExternalLink,
  Pause,
  Play,
  Trash2,
  Building2,
} from 'lucide-react'

interface MlPreview {
  property: {
    id: string
    title: string | null
    description: string | null
    photos: string[]
    asking_price: number
    currency: string
    address: string
    neighborhood: string
    rooms: number | null
    bedrooms: number | null
    bathrooms: number | null
    covered_area: number | null
    total_area: number | null
  }
  payload: {
    title: string
    category_id: string
    price: number
    currency_id: string
    pictures: { source: string }[]
    description: { plain_text: string }
    location: { address_line: string }
  } | null
  validation: { ok: boolean; errors: string[]; warnings: string[] }
  listing: {
    status: string
    external_id: string | null
    external_url: string | null
    last_published_at: string | null
    last_error: string | null
  } | null
}

interface Props {
  propertyId: string
}

type Step = 'preview' | 'edit' | 'confirm' | 'done' | 'manage'

export function MercadoLibreWizard({ propertyId }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('preview')
  const [data, setData] = useState<MlPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')
  const [editedDescription, setEditedDescription] = useState('')
  const [editedPrice, setEditedPrice] = useState(0)
  const [editedPhotos, setEditedPhotos] = useState<string[]>([])
  const [publishResult, setPublishResult] = useState<{
    externalId: string
    externalUrl: string
  } | null>(null)
  const [managing, setManaging] = useState<'pause' | 'close' | 'activate' | null>(null)

  async function load() {
    setLoading(true)
    try {
      const r = await fetch(`/api/properties/${propertyId}/ml-preview`)
      if (!r.ok) throw new Error('No se pudo cargar el preview')
      const j = (await r.json()) as MlPreview
      setData(j)
      setEditedTitle(j.property.title ?? j.payload?.title ?? '')
      setEditedDescription(j.property.description ?? '')
      setEditedPrice(j.property.asking_price)
      setEditedPhotos(j.property.photos)
      // Si ya hay un listing con external_id, arrancamos en pantalla de gestión.
      // Esto evita que el asesor re-publique sin querer y cree duplicados en ML.
      if (j.listing?.external_id) {
        setStep('manage')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  async function changeListingStatus(action: 'pause' | 'close' | 'activate') {
    const confirmMsg = action === 'close'
      ? '¿Cerrar el aviso DEFINITIVAMENTE? Esta acción no se puede deshacer — para volver a publicar habría que hacerlo desde cero.'
      : action === 'pause'
        ? '¿Pausar el aviso? Deja de ser visible al público pero se puede reactivar después.'
        : '¿Reactivar el aviso? Vuelve a ser visible al público.'
    if (!confirm(confirmMsg)) return

    setManaging(action)
    try {
      const r = await fetch(`/api/properties/${propertyId}/ml-publish`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const j = (await r.json()) as { ok?: boolean; status?: string; error?: string; needs_retry?: boolean; message?: string }
      if (!r.ok) throw new Error(j.error ?? 'Error al cambiar estado')

      if (action === 'close') {
        toast.success('Aviso cerrado definitivamente en MercadoLibre')
      } else if (action === 'pause') {
        if (j.needs_retry) {
          toast.info(j.message ?? 'ML está validando el aviso. Se pausará automáticamente.')
        } else {
          toast.success('Aviso pausado en MercadoLibre')
        }
      } else {
        toast.success('Aviso reactivado en MercadoLibre')
      }

      // Recargar el estado del listing
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setManaging(null)
    }
  }

  useEffect(() => {
    load()
  }, [propertyId])

  async function saveEdits() {
    setSaving(true)
    try {
      const r = await fetch(`/api/properties/${propertyId}/ml-preview`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: editedTitle,
          description: editedDescription,
          asking_price: editedPrice,
          photos: editedPhotos,
        }),
      })
      const j = (await r.json()) as MlPreview & { error?: string }
      if (!r.ok) throw new Error(j.error ?? 'Error al guardar')
      setData(j)
      toast.success('Cambios guardados')
      setStep('confirm')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  async function publish() {
    setPublishing(true)
    try {
      const r = await fetch(`/api/properties/${propertyId}/ml-publish`, {
        method: 'POST',
      })
      const j = (await r.json()) as {
        ok?: boolean
        externalId?: string
        externalUrl?: string
        error?: string
      }
      if (!r.ok || !j.ok) throw new Error(j.error ?? 'Error al publicar')
      setPublishResult({
        externalId: j.externalId!,
        externalUrl: j.externalUrl!,
      })
      setStep('done')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setPublishing(false)
    }
  }

  function movePhoto(idx: number, dir: -1 | 1) {
    const next = [...editedPhotos]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setEditedPhotos(next)
  }

  if (loading || !data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  const { property, payload, validation, listing } = data
  const canPublish = validation.ok && payload != null

  // Render pantalla de gestión si ya hay aviso publicado/pausado.
  if (step === 'manage' && listing?.external_id) {
    return (
      <ManageListingPanel
        listing={listing}
        propertyAddress={property.address}
        propertyTitle={property.title}
        managing={managing}
        onAction={changeListingStatus}
        onBackToDetail={() => router.push(`/properties/${propertyId}`)}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex items-center gap-2 text-sm">
        <StepBadge active={step === 'preview'} done={step !== 'preview'} label="1. Vista previa" />
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        <StepBadge
          active={step === 'edit'}
          done={step === 'confirm' || step === 'done'}
          label="2. Editar"
        />
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        <StepBadge active={step === 'confirm'} done={step === 'done'} label="3. Confirmar" />
      </div>

      {/* Validation */}
      {(validation.errors.length > 0 || validation.warnings.length > 0) && (
        <Card
          className={
            validation.errors.length > 0 ? 'border-red-300' : 'border-amber-300'
          }
        >
          <CardContent className="py-4 space-y-2">
            {validation.errors.map((e, i) => (
              <div key={`e-${i}`} className="flex items-start gap-2 text-sm">
                <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                <span>{e}</span>
              </div>
            ))}
            {validation.warnings.map((w, i) => (
              <div key={`w-${i}`} className="flex items-start gap-2 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* STEP 1 — preview */}
      {step === 'preview' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Eye className="h-4 w-4" />
              Así se va a ver el aviso
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border overflow-hidden">
              {property.photos[0] && (
                <div className="relative aspect-[16/10] bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={property.photos[0]}
                    alt={editedTitle || property.address}
                    className="object-cover w-full h-full"
                  />
                </div>
              )}
              <div className="p-4 space-y-2">
                <p className="text-2xl font-semibold tabular-num">
                  {new Intl.NumberFormat('es-AR', {
                    style: 'currency',
                    currency: property.currency,
                    minimumFractionDigits: 0,
                  }).format(property.asking_price)}
                </p>
                <h3 className="text-lg font-medium">{editedTitle || payload?.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {property.address} · {property.neighborhood}
                </p>
                <div className="flex gap-3 text-xs text-muted-foreground pt-2">
                  {property.rooms && <span>{property.rooms} amb</span>}
                  {property.bedrooms && <span>{property.bedrooms} dorm</span>}
                  {property.bathrooms && <span>{property.bathrooms} baños</span>}
                  {property.covered_area && <span>{property.covered_area} m² cub</span>}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Descripción</p>
              <div className="rounded border bg-muted/30 p-3 text-sm whitespace-pre-wrap max-h-48 overflow-auto">
                {editedDescription || (
                  <span className="text-muted-foreground italic">Sin descripción</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {editedDescription.length} caracteres (ML pide ≥ 100)
              </p>
            </div>

            {property.photos.length > 1 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Fotos adicionales ({property.photos.length})</p>
                <div className="grid grid-cols-4 gap-2">
                  {property.photos.slice(0, 8).map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={url}
                      alt={`Foto ${i + 1}`}
                      className="rounded aspect-square object-cover"
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-3">
              <Button onClick={() => setStep('edit')} variant="outline" className="flex-1">
                <Pencil className="h-4 w-4 mr-1" />
                Editar antes de publicar
              </Button>
              <Button
                onClick={() => setStep('confirm')}
                disabled={!canPublish}
                className="flex-1"
              >
                Está OK, ir a publicar
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2 — edit */}
      {step === 'edit' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Pencil className="h-4 w-4" />
              Editar antes de publicar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Título (máx 60)</label>
              <input
                type="text"
                value={editedTitle}
                onChange={e => setEditedTitle(e.target.value.slice(0, 60))}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="Ej: Depto 3 amb Palermo balcón aterrazado"
              />
              <p className="text-xs text-muted-foreground">
                {editedTitle.length} / 60 caracteres
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Descripción (mín 100)</label>
              <textarea
                value={editedDescription}
                onChange={e => setEditedDescription(e.target.value)}
                rows={6}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
                placeholder="Detallá ambientes, orientación, vistas, amenities, transporte cercano…"
              />
              <p className="text-xs text-muted-foreground">
                {editedDescription.length} caracteres (mín 100 para ML)
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Precio</label>
              <input
                type="number"
                value={editedPrice}
                onChange={e => setEditedPrice(Number(e.target.value) || 0)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm tabular-num"
              />
              <p className="text-xs text-muted-foreground">Moneda: {property.currency}</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Orden de fotos ({editedPhotos.length})
              </label>
              <div className="space-y-1.5">
                {editedPhotos.map((url, i) => (
                  <div
                    key={url}
                    className="flex items-center gap-2 rounded border bg-card p-2"
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-10 w-14 rounded object-cover" />
                    <span className="flex-1 text-xs text-muted-foreground">
                      {i === 0 ? '⭐ Principal' : `Foto ${i + 1}`}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => movePhoto(i, -1)}
                      disabled={i === 0}
                    >
                      ↑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => movePhoto(i, 1)}
                      disabled={i === editedPhotos.length - 1}
                    >
                      ↓
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-3">
              <Button onClick={() => setStep('preview')} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Volver al preview
              </Button>
              <Button onClick={saveEdits} disabled={saving} className="flex-1">
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    Guardando…
                  </>
                ) : (
                  <>
                    Guardar y continuar
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3 — confirm */}
      {step === 'confirm' && (
        <Card className="border-emerald-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Rocket className="h-4 w-4 text-emerald-700" />
              Confirmar y publicar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm space-y-1">
              <p className="font-medium">Vas a publicar este aviso en MercadoLibre:</p>
              <p>
                <strong>Título:</strong> {editedTitle || payload?.title}
              </p>
              <p>
                <strong>Precio:</strong>{' '}
                {new Intl.NumberFormat('es-AR', {
                  style: 'currency',
                  currency: property.currency,
                  minimumFractionDigits: 0,
                }).format(editedPrice)}
              </p>
              <p>
                <strong>Fotos:</strong> {editedPhotos.length}
              </p>
              <p>
                <strong>Descripción:</strong> {editedDescription.length} caracteres
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              ML va a validar el aviso (puede tardar de 30s a varios minutos). Una vez
              validado, queda <strong>activo y visible al público</strong>. Si querés
              pausarlo, podés hacerlo después desde el panel de ML o desde acá.
            </p>

            <div className="flex gap-2">
              <Button onClick={() => setStep('edit')} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Editar
              </Button>
              <Button
                onClick={publish}
                disabled={publishing || !canPublish}
                className="flex-1 bg-emerald-700 hover:bg-emerald-800"
              >
                {publishing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    Publicando…
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4 mr-1" />
                    Publicar en MercadoLibre
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 4 — done */}
      {step === 'done' && publishResult && (
        <Card className="border-emerald-300 bg-emerald-50/30">
          <CardContent className="py-8 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
            <h3 className="font-semibold text-lg">¡Aviso publicado!</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              ML está validando el aviso. Va a quedar visible al público una vez que
              termine la validación interna (30s a varios minutos). Te dejamos los
              links:
            </p>
            <div className="space-y-2 max-w-sm mx-auto pt-2">
              <p className="text-xs text-muted-foreground">
                ID del aviso: <code>{publishResult.externalId}</code>
              </p>
              <Button asChild className="w-full">
                <a
                  href={publishResult.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Abrir aviso en MercadoLibre
                  <ExternalLink className="h-4 w-4 ml-1" />
                </a>
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push(`/properties/${propertyId}`)}
              >
                Volver al detalle de la propiedad
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StepBadge({
  active,
  done,
  label,
}: {
  active: boolean
  done: boolean
  label: string
}) {
  return (
    <Badge
      className={
        done
          ? 'bg-emerald-600 text-white'
          : active
            ? 'bg-[color:var(--brand)] text-white'
            : 'bg-muted text-muted-foreground'
      }
    >
      {done && <CheckCircle2 className="h-3 w-3 mr-1" />}
      {label}
    </Badge>
  )
}

function ManageListingPanel({
  listing,
  propertyAddress,
  propertyTitle,
  managing,
  onAction,
  onBackToDetail,
}: {
  listing: {
    status: string
    external_id: string | null
    external_url: string | null
    last_published_at: string | null
    last_error: string | null
  }
  propertyAddress: string
  propertyTitle: string | null
  managing: 'pause' | 'close' | 'activate' | null
  onAction: (action: 'pause' | 'close' | 'activate') => void
  onBackToDetail: () => void
}) {
  const statusInfo = {
    published: { label: 'Activo y visible', color: 'bg-emerald-600' },
    paused: { label: 'Pausado (no visible)', color: 'bg-amber-500' },
    closed: { label: 'Cerrado (definitivo)', color: 'bg-gray-500' },
    failed: { label: 'Error', color: 'bg-red-500' },
    publishing: { label: 'Publicando…', color: 'bg-blue-500' },
    pending: { label: 'En cola', color: 'bg-blue-500' },
  }[listing.status] ?? { label: listing.status, color: 'bg-gray-400' }

  const isPublished = listing.status === 'published'
  const isPaused = listing.status === 'paused'
  const isClosed = listing.status === 'closed'

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[color:var(--brand)]" />
              Aviso en MercadoLibre
            </span>
            <Badge className={`${statusInfo.color} text-white text-[10px] h-5`}>
              {statusInfo.label}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted/30 p-4 space-y-2 text-sm">
            <p>
              <strong>{propertyTitle ?? propertyAddress}</strong>
            </p>
            <p className="text-muted-foreground text-xs">
              ID del aviso: <code className="text-foreground">{listing.external_id}</code>
            </p>
            {listing.last_published_at && (
              <p className="text-muted-foreground text-xs">
                Publicado:{' '}
                {new Date(listing.last_published_at).toLocaleString('es-AR')}
              </p>
            )}
            {listing.last_error && (
              <p className="text-amber-700 text-xs mt-2">
                ⚠ {listing.last_error}
              </p>
            )}
            {listing.external_url && (
              <a
                href={listing.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-[color:var(--brand)] underline mt-2"
              >
                Abrir aviso en MercadoLibre
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {!isClosed && (
            <>
              <div className="border-t pt-4 space-y-2">
                <p className="text-sm font-medium">¿Qué querés hacer?</p>

                {isPublished && (
                  <Button
                    onClick={() => onAction('pause')}
                    disabled={managing !== null}
                    variant="outline"
                    className="w-full justify-start"
                  >
                    {managing === 'pause' ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Pause className="h-4 w-4 mr-2" />
                    )}
                    Pausar el aviso (reversible)
                  </Button>
                )}

                {isPaused && (
                  <Button
                    onClick={() => onAction('activate')}
                    disabled={managing !== null}
                    variant="outline"
                    className="w-full justify-start"
                  >
                    {managing === 'activate' ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Reactivar el aviso
                  </Button>
                )}

                <Button
                  onClick={() => onAction('close')}
                  disabled={managing !== null}
                  variant="destructive"
                  className="w-full justify-start"
                >
                  {managing === 'close' ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Cerrar definitivamente
                </Button>
                <p className="text-xs text-muted-foreground pt-1">
                  <strong>Pausar</strong> deja el aviso oculto pero podés reactivarlo
                  después. <strong>Cerrar</strong> termina el aviso de forma
                  definitiva — para volver a publicar habría que hacerlo desde cero.
                </p>
              </div>
            </>
          )}

          {isClosed && (
            <div className="border-t pt-4">
              <p className="text-sm text-muted-foreground">
                El aviso fue cerrado. Si querés volver a publicar la propiedad, andá
                al detalle y empezá el flujo de nuevo.
              </p>
            </div>
          )}

          <Button onClick={onBackToDetail} variant="ghost" className="w-full mt-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Volver al detalle de la propiedad
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
