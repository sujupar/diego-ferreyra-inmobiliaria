'use client'

/**
 * Wizard de Meta Ads v2 — flujo de 11 etapas con generación async de 27 piezas.
 * Reemplaza progresivamente al MetaAdsWizard (que queda como fallback).
 *
 * Arquitectura:
 *  - Crea un meta_launch_job al iniciar.
 *  - Polling cada 3s mientras el job está en estados analyzing/generating.
 *  - Cada paso del UI guarda input via PATCH save-input.
 *  - Generación de 27 piezas en batches de 3 (frontend dispara 9 llamadas).
 *  - Confirm crea campaña + custom audiences.
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Star,
  Users,
  MapPin,
  Wallet,
  Image as ImageIcon,
  Video,
  Rocket,
  ArrowLeft,
  ArrowRight,
  RefreshCw,
} from 'lucide-react'

interface BuyerAvatar {
  id: string
  shortLabel: string
  ageRange: string
  occupation: string
  lifeMoment: string
  motivation: string
  concerns: string[]
  communicationTone: string
  visualCue: string
  hooks: string[]
  reasoning: string
}

interface JobData {
  id: string
  status: string
  current_step: string | null
  progress_percent: number | null
  description_used: string | null
  detected_strengths: { highlights?: Array<{ id: string; label: string; reasoning: string; impactScore?: number }>; ambience?: string; summary?: string; source?: string } | null
  generated_avatars: { avatars?: BuyerAvatar[] } | null
  selected_avatar_id: string | null
  optimized_avatar: BuyerAvatar | null
  starred_photo_indices: number[] | null
  geo_preset_id: string | null
  daily_budget_ars: number | null
  videos_to_include: string[] | null
  result_campaign_id: string | null
  error_message: string | null
}

interface AssetPreview {
  id: string
  highlight_id: string
  format: string
  storage_url: string | null
  photo_source_index: number | null
  composition_variant: number | null
}

interface PropertyMinimal {
  id: string
  address: string
  neighborhood: string
  city: string
  property_type: string
  rooms: number | null
  bedrooms: number | null
  bathrooms: number | null
  garages: number | null
  covered_area: number | null
  total_area: number | null
  asking_price: number
  currency: string
  photos: string[]
  description: string | null
  title: string | null
  expensas: number | null
  video_url: string | null
  public_slug: string | null
}

type WizardStep =
  | 'confirm_data'
  | 'analyzing' // 2-3-4 fusionados (descripción + vision + avatares)
  | 'avatar_select'
  | 'photo_stars'
  | 'geo'
  | 'budget'
  | 'generating' // 27 piezas
  | 'review_and_publish'
  | 'publishing'
  | 'done'

interface Props {
  propertyId: string
  property: PropertyMinimal
}

const GEO_PRESETS = [
  { id: 'cercanos', label: 'Personas cercanas', detail: 'Pin de 2 km en la propiedad' },
  { id: 'similares', label: 'Barrios con perfil parecido', detail: '6-7 pines de 2 km en barrios del mismo cluster' },
  { id: 'amplio', label: 'Toda CABA', detail: 'Radio grande para premium / inversores' },
] as const

const BUDGET_OPTIONS = [5_000, 10_000, 15_000, 25_000, 50_000] as const

export function MetaAdsWizardV2({ propertyId, property }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<WizardStep>('confirm_data')
  const [jobId, setJobId] = useState<string | null>(null)
  const [job, setJob] = useState<JobData | null>(null)
  const [assets, setAssets] = useState<AssetPreview[]>([])
  const [loading, setLoading] = useState(false)
  const [starting, setStarting] = useState(false)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Inputs del asesor
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>('')
  const [avatarComment, setAvatarComment] = useState('')
  const [optimizingAvatar, setOptimizingAvatar] = useState(false)
  const [optimizedAvatar, setOptimizedAvatar] = useState<BuyerAvatar | null>(null)
  const [starredPhotos, setStarredPhotos] = useState<number[]>([])
  const [geoPresetId, setGeoPresetId] = useState<string>('similares')
  const [dailyBudget, setDailyBudget] = useState<number>(10_000)
  const [generationProgress, setGenerationProgress] = useState<{ generated: number; total: number; failures: number }>({ generated: 0, total: 27, failures: 0 })
  // CRÍTICO: usar useRef en vez de useState. El recursive runNextBatch lee
  // este flag sincrónicamente — si fuera useState, la closure capturada lee
  // un valor stale y la cadena se rompe después del primer batch.
  const generatingBatchRef = useRef(false)
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])
  const [finalResult, setFinalResult] = useState<{ campaignId: string; adsManagerUrl: string } | null>(null)

  // Polling helper
  async function pollStatus() {
    if (!jobId) return
    try {
      const r = await fetch(`/api/properties/${propertyId}/meta-launch-v2/${jobId}/status`)
      if (!r.ok) return
      const data = await r.json()
      setJob(data.job)
      setAssets(data.assets ?? [])

      // Sincronizar UI step con job status
      if (data.job?.status === 'awaiting_user_input' && step === 'analyzing') {
        setStep('avatar_select')
      }
      if (data.job?.status === 'awaiting_confirm' && step === 'generating') {
        setStep('review_and_publish')
      }
      if (data.job?.status === 'published') {
        setStep('done')
        setFinalResult({
          campaignId: data.job.result_campaign_id,
          adsManagerUrl: `https://business.facebook.com/adsmanager/manage/campaigns?act=${(process.env.NEXT_PUBLIC_META_AD_ACCOUNT_ID ?? '').replace('act_', '')}&selected_campaign_ids=${data.job.result_campaign_id}`,
        })
      }
      if (data.job?.status === 'failed') {
        toast.error(`Fallo: ${data.job.error_message ?? 'desconocido'}`)
      }
    } catch (err) {
      console.warn('[wizard v2] poll error', err)
    }
  }

  // Setup polling solo cuando estamos en analyzing/generating
  useEffect(() => {
    if (step === 'analyzing' || step === 'generating') {
      pollStatus()
      pollIntervalRef.current = setInterval(pollStatus, 3000)
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, jobId])

  // === Acciones ===

  async function startJob() {
    setStarting(true)
    try {
      const r = await fetch(`/api/properties/${propertyId}/meta-launch-v2/start`, {
        method: 'POST',
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'No se pudo iniciar')
      setJobId(data.jobId)
      setStep('analyzing')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setStarting(false)
    }
  }

  async function saveInput(payload: Record<string, unknown>) {
    if (!jobId) return
    const r = await fetch(`/api/properties/${propertyId}/meta-launch-v2/${jobId}/save-input`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!r.ok) {
      const data = await r.json().catch(() => ({}))
      throw new Error(data.error ?? 'Error al guardar')
    }
  }

  async function optimizeWithComment() {
    if (!jobId || !selectedAvatarId || avatarComment.trim().length < 5) return
    setOptimizingAvatar(true)
    try {
      const r = await fetch(
        `/api/properties/${propertyId}/meta-launch-v2/${jobId}/optimize-avatar`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ avatarId: selectedAvatarId, comment: avatarComment }),
        },
      )
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'Error')
      setOptimizedAvatar(data.optimized)
      toast.success('Avatar refinado con tu comentario')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setOptimizingAvatar(false)
    }
  }

  async function startGeneration() {
    if (!jobId) return
    try {
      await saveInput({
        selectedAvatarId,
        avatarComment,
        optimizedAvatar: optimizedAvatar ?? null,
        starredPhotoIndices: starredPhotos,
        geoPresetId,
        dailyBudgetArs: dailyBudget,
        readyToGenerate: true,
      })
      setStep('generating')
      // Trigger initial batch
      void runNextBatch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    }
  }

  async function runNextBatch() {
    if (!jobId) return
    // Guard sincrónico vía ref (no state) para que las llamadas encadenadas
    // detecten el lock inmediatamente, no en el próximo render.
    if (generatingBatchRef.current) return
    if (!mountedRef.current) return
    generatingBatchRef.current = true
    try {
      const r = await fetch(
        `/api/properties/${propertyId}/meta-launch-v2/${jobId}/generate-batch`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ batchSize: 3 }),
        },
      )
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'Error generando batch')
      if (mountedRef.current) {
        setGenerationProgress({
          generated: data.totalGenerated,
          total: data.totalPieces,
          failures: data.failures,
        })
      }
      // Liberar el lock ANTES de la recursión (sino la recursión la skipea)
      generatingBatchRef.current = false
      if (!data.done && mountedRef.current) {
        void runNextBatch()
      }
    } catch (err) {
      generatingBatchRef.current = false
      if (mountedRef.current) {
        toast.error(err instanceof Error ? err.message : 'Error')
      }
    }
  }

  async function confirmAndPublish() {
    if (!jobId) return
    setLoading(true)
    setStep('publishing')
    try {
      const r = await fetch(
        `/api/properties/${propertyId}/meta-launch-v2/${jobId}/confirm`,
        { method: 'POST' },
      )
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'Error al publicar')
      setFinalResult({
        campaignId: data.campaignId,
        adsManagerUrl: data.adsManagerUrl,
      })
      setStep('done')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
      setStep('review_and_publish')
    } finally {
      setLoading(false)
    }
  }

  // === Renders por step ===

  if (step === 'confirm_data') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-[color:var(--brand)]" />
            Paso 1 — Confirmá los datos de la propiedad
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Estos son los datos que vamos a usar para la campaña. Si algo no encaja,
            editalo en la ficha de la propiedad antes de continuar.
          </p>
          <div className="rounded-lg bg-muted/30 p-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div><span className="text-muted-foreground">Tipo:</span> {property.property_type}</div>
            <div><span className="text-muted-foreground">Barrio:</span> {property.neighborhood}</div>
            <div className="col-span-2"><span className="text-muted-foreground">Dirección:</span> {property.address}</div>
            <div><span className="text-muted-foreground">Ambientes:</span> {property.rooms ?? '—'}</div>
            <div><span className="text-muted-foreground">Dormitorios:</span> {property.bedrooms ?? '—'}</div>
            <div><span className="text-muted-foreground">Baños:</span> {property.bathrooms ?? '—'}</div>
            <div><span className="text-muted-foreground">Cocheras:</span> {property.garages ?? '—'}</div>
            <div><span className="text-muted-foreground">Cubierta:</span> {property.covered_area ? `${property.covered_area} m²` : '—'}</div>
            <div><span className="text-muted-foreground">Total:</span> {property.total_area ? `${property.total_area} m²` : '—'}</div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Precio:</span>{' '}
              <strong>{new Intl.NumberFormat('es-AR', { style: 'currency', currency: property.currency, minimumFractionDigits: 0 }).format(property.asking_price)}</strong>
            </div>
            <div><span className="text-muted-foreground">Expensas:</span> {property.expensas ? `ARS ${property.expensas.toLocaleString('es-AR')}` : '—'}</div>
            <div><span className="text-muted-foreground">Fotos cargadas:</span> {property.photos.length}</div>
          </div>
          <Button onClick={startJob} disabled={starting} className="w-full" size="lg">
            {starting ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Iniciando análisis…</>
            ) : (
              <>Confirmar y comenzar análisis<ArrowRight className="h-4 w-4 ml-2" /></>
            )}
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (step === 'analyzing') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Loader2 className="h-4 w-4 animate-spin text-[color:var(--brand)]" />
            Paso 2-4 — Analizando la propiedad con IA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">{stepLabel(job?.current_step)}</p>
            <Progress value={job?.progress_percent ?? 0} />
            <p className="text-xs text-muted-foreground mt-1">
              {job?.progress_percent ?? 0}% — esto suele tardar 20-40 segundos
            </p>
          </div>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>{(job?.progress_percent ?? 0) >= 15 ? '✓' : '◌'} Recuperando descripción del portal o generándola</li>
            <li>{(job?.progress_percent ?? 0) >= 35 ? '✓' : '◌'} Analizando las {property.photos.length} fotos con Gemini Vision</li>
            <li>{(job?.progress_percent ?? 0) >= 65 ? '✓' : '◌'} Detectando fortalezas y debilidades</li>
            <li>{(job?.progress_percent ?? 0) >= 90 ? '✓' : '◌'} Generando 3 perfiles de comprador ideal</li>
          </ul>
        </CardContent>
      </Card>
    )
  }

  if (step === 'avatar_select') {
    const avatars = job?.generated_avatars?.avatars ?? []
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Paso 4 — ¿Quién es el comprador ideal?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            El sistema identificó <strong>3 perfiles de comprador</strong> probables. Elegí el
            que mejor te encaja. Podés agregar un comentario para refinarlo.
          </p>
          <div className="space-y-3">
            {avatars.map(av => (
              <label
                key={av.id}
                className={`block p-4 rounded-lg border-2 cursor-pointer transition ${
                  selectedAvatarId === av.id
                    ? 'border-[color:var(--brand)] bg-[color:var(--brand)]/5'
                    : 'border-border hover:bg-muted/30'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="avatar"
                    checked={selectedAvatarId === av.id}
                    onChange={() => setSelectedAvatarId(av.id)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-sm">{av.shortLabel}</span>
                      <Badge variant="outline" className="text-[10px] h-4">{av.ageRange}</Badge>
                      <Badge variant="outline" className="text-[10px] h-4 capitalize">{av.communicationTone}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{av.occupation} — {av.lifeMoment}</p>
                    <p className="text-sm">{av.motivation}</p>
                    {av.concerns.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        <strong>Le preocupa:</strong> {av.concerns.join(' · ')}
                      </p>
                    )}
                  </div>
                </div>
              </label>
            ))}
          </div>
          {selectedAvatarId && (
            <div className="space-y-2 pt-2 border-t">
              <label className="text-sm font-medium">Comentario opcional para refinar (no cambia la esencia)</label>
              <textarea
                value={avatarComment}
                onChange={e => setAvatarComment(e.target.value)}
                rows={2}
                placeholder="Ej: este perfil generalmente viene con pareja, agregaría que valora la cercanía a colegios privados…"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
              <Button
                onClick={optimizeWithComment}
                disabled={!avatarComment.trim() || optimizingAvatar}
                variant="outline"
                size="sm"
              >
                {optimizingAvatar ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                Refinar avatar con este comentario
              </Button>
              {optimizedAvatar && (
                <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900 mt-2">
                  <strong>Avatar refinado:</strong> {optimizedAvatar.motivation}
                </div>
              )}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button onClick={() => router.push(`/properties/${propertyId}`)} variant="ghost">
              <ArrowLeft className="h-4 w-4 mr-1" />Volver
            </Button>
            <Button
              onClick={() => setStep('photo_stars')}
              disabled={!selectedAvatarId}
              className="flex-1"
            >
              Siguiente<ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (step === 'photo_stars') {
    const togglePhoto = (idx: number) => {
      setStarredPhotos(prev => {
        if (prev.includes(idx)) return prev.filter(i => i !== idx)
        if (prev.length >= 3) return prev
        return [...prev, idx]
      })
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Star className="h-4 w-4" />
            Paso 5 — Elegí las 3 fotos principales
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Marcá con estrella las <strong>3 fotos que mejor venden</strong> esta propiedad.
            Vamos a usar cada una como base para generar 3 piezas gráficas distintas
            (9 piezas por foto × 3 fotos = <strong>27 anuncios</strong>).
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {property.photos.map((url, idx) => {
              const isStarred = starredPhotos.includes(idx)
              const orderNum = isStarred ? starredPhotos.indexOf(idx) + 1 : null
              return (
                <button
                  key={idx}
                  onClick={() => togglePhoto(idx)}
                  className={`relative rounded-lg overflow-hidden border-2 transition ${
                    isStarred
                      ? 'border-amber-500 ring-2 ring-amber-300'
                      : 'border-transparent hover:border-muted-foreground/30'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Foto ${idx + 1}`} className="aspect-square w-full object-cover" />
                  <div className="absolute top-2 right-2 h-7 w-7 rounded-full bg-white/90 flex items-center justify-center shadow">
                    {isStarred ? (
                      <span className="text-amber-600 font-bold text-sm">{orderNum}</span>
                    ) : (
                      <Star className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground text-center">
            {starredPhotos.length} / 3 fotos seleccionadas
          </p>
          <div className="flex gap-2">
            <Button onClick={() => setStep('avatar_select')} variant="ghost"><ArrowLeft className="h-4 w-4 mr-1" />Atrás</Button>
            <Button
              onClick={() => setStep('geo')}
              disabled={starredPhotos.length !== 3}
              className="flex-1"
            >Siguiente<ArrowRight className="h-4 w-4 ml-1" /></Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (step === 'geo') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4" />
            Paso 6 — ¿A qué zona mostrar el aviso?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {GEO_PRESETS.map(p => (
            <label
              key={p.id}
              className={`block p-3 rounded-lg border-2 cursor-pointer transition ${
                geoPresetId === p.id ? 'border-[color:var(--brand)] bg-[color:var(--brand)]/5' : 'border-border hover:bg-muted/30'
              }`}
            >
              <input type="radio" name="geo" checked={geoPresetId === p.id} onChange={() => setGeoPresetId(p.id)} className="mr-2" />
              <span className="font-medium text-sm">{p.label}</span>
              <p className="text-xs text-muted-foreground ml-5">{p.detail}</p>
            </label>
          ))}
          <div className="flex gap-2">
            <Button onClick={() => setStep('photo_stars')} variant="ghost"><ArrowLeft className="h-4 w-4 mr-1" />Atrás</Button>
            <Button onClick={() => setStep('budget')} className="flex-1">Siguiente<ArrowRight className="h-4 w-4 ml-1" /></Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (step === 'budget') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4" />
            Paso 9 — Presupuesto diario
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">¿Cuánto querés invertir por día en esta campaña?</p>
          <div className="grid grid-cols-3 gap-2">
            {BUDGET_OPTIONS.map(b => (
              <button
                key={b}
                onClick={() => setDailyBudget(b)}
                className={`p-3 rounded-lg border-2 text-sm font-medium transition ${
                  dailyBudget === b ? 'border-[color:var(--brand)] bg-[color:var(--brand)]/5' : 'border-border hover:bg-muted/30'
                }`}
              >
                ARS {b.toLocaleString('es-AR')}
              </button>
            ))}
          </div>
          <div>
            <label className="text-sm font-medium">O ingresá un monto personalizado</label>
            <input
              type="number"
              value={dailyBudget}
              onChange={e => setDailyBudget(Math.max(1000, Number(e.target.value) || 0))}
              step={1000}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm mt-1"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            La campaña queda en PAUSADO en Meta Ads. Solo gasta cuando vos la activás.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => setStep('geo')} variant="ghost"><ArrowLeft className="h-4 w-4 mr-1" />Atrás</Button>
            <Button onClick={startGeneration} className="flex-1" size="lg">
              <ImageIcon className="h-4 w-4 mr-1" />Generar las 27 piezas
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (step === 'generating') {
    const pct = Math.floor((generationProgress.generated / generationProgress.total) * 100)
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Loader2 className="h-4 w-4 animate-spin" />
            Paso 7 — Generando 27 piezas gráficas con IA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={pct} />
          <p className="text-sm text-muted-foreground text-center">
            {generationProgress.generated} / {generationProgress.total} piezas generadas
            {generationProgress.failures > 0 ? ` (${generationProgress.failures} fallaron)` : ''}
          </p>
          <p className="text-xs text-muted-foreground text-center">
            Total estimado: 5-7 minutos. Podés dejar esta pantalla abierta.
          </p>
          {assets.length > 0 && (
            <div className="grid grid-cols-3 md:grid-cols-4 gap-2 max-h-64 overflow-y-auto">
              {assets.map(a => (
                a.storage_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={a.id} src={a.storage_url} alt="" className="aspect-square rounded object-cover" />
                ) : (
                  <div key={a.id} className="aspect-square rounded bg-muted flex items-center justify-center text-xs">
                    {a.format}
                  </div>
                )
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  if (step === 'review_and_publish') {
    return (
      <Card className="border-emerald-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Rocket className="h-4 w-4 text-emerald-700" />
            Paso 10 — Revisión final
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 space-y-1 text-sm">
            <p><strong>Propiedad:</strong> {property.address}</p>
            <p><strong>Avatar elegido:</strong> {optimizedAvatar?.shortLabel ?? job?.generated_avatars?.avatars?.find(a => a.id === selectedAvatarId)?.shortLabel}</p>
            <p><strong>Geo:</strong> {GEO_PRESETS.find(p => p.id === geoPresetId)?.label}</p>
            <p><strong>Presupuesto:</strong> ARS {dailyBudget.toLocaleString('es-AR')} / día</p>
            <p><strong>Piezas generadas:</strong> {assets.length}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Al publicar, vamos a: crear la campaña en Meta (PAUSADA), subir las primeras 10
            piezas como anuncios, y crear 2 públicos personalizados (visitantes + convertidores).
          </p>
          <Button onClick={confirmAndPublish} disabled={loading} className="w-full bg-emerald-700 hover:bg-emerald-800" size="lg">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Rocket className="h-4 w-4 mr-2" />}
            Publicar campaña (queda pausada)
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (step === 'publishing') {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-3">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-[color:var(--brand)]" />
          <p className="font-medium">Publicando campaña + creando públicos…</p>
          <p className="text-xs text-muted-foreground">Esto tarda ~10-20 segundos</p>
        </CardContent>
      </Card>
    )
  }

  if (step === 'done' && finalResult) {
    return (
      <Card className="border-emerald-300 bg-emerald-50/30">
        <CardContent className="py-8 text-center space-y-3">
          <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
          <h3 className="font-semibold text-lg">¡Campaña creada!</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            La campaña está en <strong>PAUSADO</strong> en Meta Ads. Andá a Ads Manager para
            revisarla y activarla cuando estés conforme.
          </p>
          <div className="space-y-2 max-w-sm mx-auto pt-2">
            <Button asChild className="w-full">
              <a href={finalResult.adsManagerUrl} target="_blank" rel="noopener noreferrer">
                Abrir en Meta Ads Manager
              </a>
            </Button>
            <Button variant="outline" className="w-full" onClick={() => router.push(`/properties/${propertyId}`)}>
              Volver al detalle
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="py-6 text-center text-sm text-muted-foreground">
        Estado inesperado: {step}
      </CardContent>
    </Card>
  )
}

function stepLabel(step: string | null | undefined): string {
  if (!step) return 'Iniciando…'
  const map: Record<string, string> = {
    starting: 'Iniciando análisis…',
    fetching_description: 'Recuperando descripción de la propiedad…',
    analyzing_photos: 'Analizando las fotos con Gemini Vision…',
    generating_avatars: 'Generando 3 perfiles de comprador ideal…',
    awaiting_avatar_selection: 'Listo — elegí el avatar',
  }
  return map[step] ?? step
}
