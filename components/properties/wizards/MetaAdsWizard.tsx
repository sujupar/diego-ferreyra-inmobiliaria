'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Eye,
  Users,
  MapPin,
  PenTool,
  Wallet,
  Rocket,
  ExternalLink,
  Camera,
  Pause,
  Play,
  Trash2,
  Building2,
} from 'lucide-react'

interface VisionHighlight {
  id: string
  label: string
  reasoning: string
  photoIndex: number
  copyHooks?: string[]
  mood?: string
  impactScore?: number
}

interface VisionData {
  highlights: VisionHighlight[]
  detectedFeatures: string[]
  bestPhotoIndex: number
  ambience: string
  summary: string
  source: 'vision' | 'template'
}

interface PersonaData {
  ageRange: [number, number]
  incomeLevel: string
  familyStatus: string
  lifestyle: string[]
  communicationTone: string
  hooks: string[]
  reasoning: string
}

interface GeoPreset {
  id: 'cercanos' | 'similares' | 'amplio'
  label: string
  description: string
  estimatedReach: string
  spec?: Record<string, unknown> // MetaTargetingSpec del backend — pasado al builder
}

interface CopyData {
  primaryTexts: string[]
  headlines: string[]
  description: string
  source: 'ai' | 'template'
}

interface BudgetData {
  dailyArs: number
  tier: { label: string }
  reasoning: string
}

interface WizardData {
  property: {
    id: string
    title: string | null
    address: string
    neighborhood: string
    property_type: string
    asking_price: number
    currency: string
    photos: string[]
    public_slug: string
  }
  landingUrl: string
  vision: VisionData
  persona: PersonaData
  presets: GeoPreset[]
  recommendedPreset: GeoPreset['id']
  budget: BudgetData
  copy: CopyData
}

interface Props {
  propertyId: string
}

type Step = 'overview' | 'highlights' | 'persona' | 'geo' | 'creative' | 'launch' | 'done'
const STEPS: Array<{ key: Step; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'overview', label: 'Resumen', icon: Eye },
  { key: 'highlights', label: 'Qué destacar', icon: Camera },
  { key: 'persona', label: 'Comprador ideal', icon: Users },
  { key: 'geo', label: 'A quién mostrar', icon: MapPin },
  { key: 'creative', label: 'Aviso', icon: PenTool },
  { key: 'launch', label: 'Lanzar', icon: Rocket },
]

interface ExistingCampaign {
  campaign_id: string
  adset_id: string | null
  ad_ids: string[] | null
  status: string
  budget_daily: number | null
  landing_url: string | null
  last_error: string | null
  created_at: string
}

export function MetaAdsWizard({ propertyId }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('overview')
  const [data, setData] = useState<WizardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [launching, setLaunching] = useState(false)
  // Si la propiedad YA tiene una campaña no archivada, mostramos panel de
  // gestión en lugar del wizard. Detectado al cargar via /meta-campaign GET.
  const [existing, setExisting] = useState<ExistingCampaign | null>(null)
  const [managing, setManaging] = useState<'pause' | 'activate' | 'archive' | null>(
    null,
  )

  // Selecciones del asesor
  const [highlightId, setHighlightId] = useState<string>('')
  const [highlightNote, setHighlightNote] = useState('')
  const [geoPresetId, setGeoPresetId] = useState<GeoPreset['id']>('similares')
  const [copyIdx, setCopyIdx] = useState(0)
  const [dailyBudget, setDailyBudget] = useState(0)
  const [launchResult, setLaunchResult] = useState<{
    campaignId: string
    adsetId: string
    adIds: string[]
    adsManagerUrl: string
  } | null>(null)

  useEffect(() => {
    async function load() {
      try {
        // Primero chequear si ya hay una campaña creada (no archivada).
        // Si existe, NO cargar el wizard — pasar directo a pantalla de gestión.
        const camp = await fetch(`/api/properties/${propertyId}/meta-campaign`)
        if (camp.ok) {
          const cd = await camp.json()
          if (
            cd.campaign?.campaign_id &&
            cd.campaign.status !== 'archived' &&
            cd.campaign.status !== 'failed'
          ) {
            setExisting(cd.campaign as ExistingCampaign)
            setLoading(false)
            return
          }
        }
        // Si no hay campaña existente, cargar wizard.
        const r = await fetch(`/api/properties/${propertyId}/meta-wizard`)
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? 'Error cargando el asistente')
        setData(j as WizardData)
        setHighlightId(j.vision.highlights[0]?.id ?? '')
        setGeoPresetId(j.recommendedPreset)
        setDailyBudget(j.budget.dailyArs)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [propertyId])

  async function manageCampaign(action: 'pause' | 'activate' | 'archive') {
    const confirmMsgs = {
      pause: '¿Pausar la campaña? Deja de gastar presupuesto pero se puede reactivar.',
      activate: '¿Reactivar la campaña? Empieza a gastar presupuesto.',
      archive:
        '¿Archivar definitivamente? La campaña se elimina de Meta Ads Manager (no se puede deshacer).',
    }
    if (!confirm(confirmMsgs[action])) return
    setManaging(action)
    try {
      const r = await fetch(`/api/properties/${propertyId}/meta-campaign`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Error')
      if (action === 'pause') toast.success('Campaña pausada')
      else if (action === 'activate') toast.success('Campaña reactivada')
      else toast.success('Campaña archivada')
      // Recargar estado
      if (action === 'archive') {
        setExisting(null)
        // Recargar el wizard limpio
        window.location.reload()
      } else {
        const camp = await fetch(`/api/properties/${propertyId}/meta-campaign`)
        if (camp.ok) {
          const cd = await camp.json()
          if (cd.campaign) setExisting(cd.campaign as ExistingCampaign)
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setManaging(null)
    }
  }

  async function launch() {
    if (!data) {
      toast.error('Datos del asistente no cargados')
      return
    }
    // Guard contra doble click: si ya está lanzando, no permitir otro intento.
    // CRÍTICO: el endpoint tarda 60-150s (generación de 10 imágenes con Gemini).
    // Sin este guard, si el cliente recibe timeout y el usuario reintenta,
    // se crean campañas duplicadas en Meta = doble gasto.
    if (launching) return
    setLaunching(true)
    try {
      // Pasamos las selecciones del asesor al builder. El endpoint siempre
      // deja la campaña PAUSED — pero usa estos overrides en lugar del
      // budget/targeting/copy/foto automáticos.
      const selectedPreset = data.presets.find(p => p.id === geoPresetId)
      // El preset.spec viene del backend con shape MetaTargetingSpec — lo
      // mandamos tal cual al builder vía targetingOverride.
      const presetSpec = selectedPreset?.spec
      const selectedHighlight = data.vision.highlights.find(h => h.id === highlightId)
      const heroPhoto = selectedHighlight
        ? data.property.photos[selectedHighlight.photoIndex] ?? data.property.photos[0]
        : data.property.photos[0]
      const r = await fetch(`/api/properties/${propertyId}/meta-launch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dailyBudgetArs: dailyBudget,
          copyVariantIdx: copyIdx,
          targetingOverride: presetSpec,
          heroPhotoUrl: heroPhoto,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Error al lanzar campaña')
      setLaunchResult(j)
      setStep('done')
    } catch (err) {
      // Si recibimos error (típicamente timeout 504 después de 30s), la
      // campaña PUEDE haberse creado igual en el backend. Hacemos poll al
      // endpoint de meta-campaign para detectarlo antes de mostrar error.
      try {
        const pollRes = await fetch(`/api/properties/${propertyId}/meta-campaign`)
        if (pollRes.ok) {
          const pollData = await pollRes.json()
          if (pollData.campaign?.campaign_id) {
            // La campaña sí existe — el error fue solo timeout de respuesta.
            toast.success(
              'La campaña se creó correctamente (el error anterior fue solo timeout de respuesta).',
            )
            const adAccountId = (process.env.NEXT_PUBLIC_META_AD_ACCOUNT_ID ?? '').replace('act_', '')
            setLaunchResult({
              campaignId: pollData.campaign.campaign_id,
              adsetId: pollData.campaign.adset_id ?? '',
              adIds: pollData.campaign.ad_ids ?? [],
              adsManagerUrl: adAccountId
                ? `https://business.facebook.com/adsmanager/manage/campaigns?act=${adAccountId}&selected_campaign_ids=${pollData.campaign.campaign_id}`
                : '',
            })
            setStep('done')
            // NO setear launching=false — dejamos el botón locked hasta navegar.
            return
          }
        }
      } catch {
        // ignore poll error
      }
      toast.error(err instanceof Error ? err.message : 'Error')
      // En este caso sí dejamos al usuario reintentar (la campaña realmente
      // no se creó). El server-side lock atómico (UNIQUE PARTIAL en DB)
      // previene duplicados si el primer intento sí había avanzado.
      setLaunching(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  // Si ya existe una campaña activa/pausada, mostrar panel de GESTIÓN en
  // lugar del wizard de creación. Esto previene crear campañas duplicadas
  // por accidente cuando el asesor entra para "ver" la campaña.
  if (existing) {
    const adAccountId = (process.env.NEXT_PUBLIC_META_AD_ACCOUNT_ID ?? '').replace(
      'act_',
      '',
    )
    const adsManagerUrl = adAccountId
      ? `https://business.facebook.com/adsmanager/manage/campaigns?act=${adAccountId}&selected_campaign_ids=${existing.campaign_id}`
      : null
    const statusMap: Record<string, { label: string; color: string }> = {
      active: { label: 'Activa', color: 'bg-emerald-600' },
      paused: { label: 'Pausada', color: 'bg-amber-500' },
      provisioning: { label: 'Creándose…', color: 'bg-blue-500' },
      failed: { label: 'Error', color: 'bg-red-500' },
    }
    const sInfo = statusMap[existing.status] ?? { label: existing.status, color: 'bg-gray-400' }
    const isActive = existing.status === 'active'
    const isPaused = existing.status === 'paused'
    const isProvisioning = existing.status === 'provisioning'

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[color:var(--brand)]" />
              Campaña Meta Ads
            </span>
            <Badge className={`${sInfo.color} text-white text-[10px] h-5`}>
              {sInfo.label}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted/30 p-4 space-y-2 text-sm">
            <p className="text-muted-foreground text-xs">
              ID de campaña: <code className="text-foreground">{existing.campaign_id}</code>
            </p>
            <p className="text-muted-foreground text-xs">
              Presupuesto: ARS {(existing.budget_daily ?? 0).toLocaleString('es-AR')} / día
            </p>
            <p className="text-muted-foreground text-xs">
              Creada: {new Date(existing.created_at).toLocaleString('es-AR')}
            </p>
            <p className="text-muted-foreground text-xs">
              {existing.ad_ids?.length ?? 0} anuncios en el conjunto
            </p>
            {existing.last_error && (
              <p className="text-xs text-amber-700 mt-1">⚠ {existing.last_error}</p>
            )}
            {adsManagerUrl && (
              <a
                href={adsManagerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-[color:var(--brand)] underline mt-2"
              >
                Abrir en Meta Ads Manager
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {!isProvisioning && (
            <div className="border-t pt-4 space-y-2">
              <p className="text-sm font-medium">¿Qué querés hacer?</p>
              {isActive && (
                <Button
                  onClick={() => manageCampaign('pause')}
                  disabled={managing !== null}
                  variant="outline"
                  className="w-full justify-start"
                >
                  {managing === 'pause' ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Pause className="h-4 w-4 mr-2" />
                  )}
                  Pausar campaña (reversible)
                </Button>
              )}
              {isPaused && (
                <Button
                  onClick={() => manageCampaign('activate')}
                  disabled={managing !== null}
                  variant="outline"
                  className="w-full justify-start"
                >
                  {managing === 'activate' ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Reactivar campaña
                </Button>
              )}
              <Button
                onClick={() => manageCampaign('archive')}
                disabled={managing !== null}
                variant="destructive"
                className="w-full justify-start"
              >
                {managing === 'archive' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Archivar campaña (eliminar)
              </Button>
              <p className="text-xs text-muted-foreground pt-1">
                <strong>Pausar:</strong> deja de gastar pero podés reactivar.
                <strong> Archivar:</strong> elimina definitivamente de Meta Ads. No
                se puede deshacer — para volver a anunciar habría que crear todo de
                nuevo.
              </p>
            </div>
          )}

          {isProvisioning && (() => {
            // Ventana de tolerancia: 2 minutos desde created_at. Antes mostramos
            // "Esperá 1-2 min". Después mostramos "Quedó a medio crear" +
            // botón directo para llamar a /cleanup, sin pedir "contactá a
            // soporte" — el flujo manual era la causa raíz del atrapamiento.
            const createdMsAgo = Date.now() - new Date(existing.created_at).getTime()
            const isStillFresh = createdMsAgo < 2 * 60_000
            if (isStillFresh) {
              return (
                <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900">
                  <strong>La campaña se está creando.</strong> Esperá 1-2 minutos y
                  refrescá la página.
                </div>
              )
            }
            return (
              <div className="space-y-2">
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
                  <strong>La campaña quedó a medio crear.</strong> Esto suele pasar
                  cuando el proceso anterior excedió el tiempo límite. Tenés que
                  archivarla para empezar limpio — no se pierden las piezas gráficas
                  ya generadas.
                </div>
                <Button
                  onClick={async () => {
                    try {
                      const r = await fetch(
                        `/api/properties/${propertyId}/meta-campaign/cleanup`,
                        { method: 'POST' },
                      )
                      const d = await r.json()
                      if (!r.ok) throw new Error(d.error ?? 'cleanup falló')
                      router.refresh()
                    } catch (err) {
                      alert(err instanceof Error ? err.message : 'Error en cleanup')
                    }
                  }}
                  variant="destructive"
                  className="w-full justify-start"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Archivar y volver al asistente
                </Button>
              </div>
            )
          })()}

          <Button
            onClick={() => router.push(`/properties/${propertyId}`)}
            variant="ghost"
            className="w-full mt-2"
          >
            ← Volver al detalle de la propiedad
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (error || !data) {
    return (
      <Card className="border-red-300">
        <CardContent className="py-6">
          <p className="text-sm text-red-700">{error ?? 'Error cargando el asistente'}</p>
        </CardContent>
      </Card>
    )
  }

  const stepIndex = STEPS.findIndex(s => s.key === step)
  const goNext = () => {
    const next = STEPS[stepIndex + 1]
    if (next) setStep(next.key)
  }
  const goBack = () => {
    const prev = STEPS[stepIndex - 1]
    if (prev) setStep(prev.key)
  }

  return (
    <div className="space-y-6">
      {/* Stepper visual */}
      <div className="overflow-x-auto pb-1">
        <div className="flex items-center gap-2 text-xs min-w-max">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const isActive = step === s.key
            const isDone = stepIndex > i
            return (
              <div key={s.key} className="flex items-center gap-2">
                <Badge
                  className={
                    isDone
                      ? 'bg-emerald-600 text-white'
                      : isActive
                        ? 'bg-[color:var(--brand)] text-white'
                        : 'bg-muted text-muted-foreground'
                  }
                >
                  <Icon className="h-3 w-3 mr-1" />
                  {i + 1}. {s.label}
                </Badge>
                {i < STEPS.length - 1 && (
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {step === 'overview' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-[color:var(--brand)]" />
              El sistema ya analizó la propiedad
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Esto es lo que aprendí. Si algo no encaja, lo vas a poder ajustar en los
              próximos pasos.
            </p>
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div>
                <p className="font-medium">Propiedad</p>
                <p className="text-muted-foreground">
                  {data.property.address} · {data.property.neighborhood}
                </p>
                <p className="text-muted-foreground">
                  {data.property.property_type} · {data.property.currency}{' '}
                  {data.property.asking_price.toLocaleString('es-AR')}
                </p>
              </div>
              <div>
                <p className="font-medium">Lo que vi en las fotos</p>
                <p className="text-muted-foreground">
                  {data.vision.summary}{' '}
                  {data.vision.source === 'template' && (
                    <span className="text-amber-700">
                      (Análisis básico — para análisis con IA configurá GEMINI_API_KEY)
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="font-medium">Comprador probable</p>
                <p className="text-muted-foreground">{data.persona.reasoning}</p>
              </div>
              <div>
                <p className="font-medium">Presupuesto sugerido</p>
                <p className="text-muted-foreground">
                  ARS {data.budget.dailyArs.toLocaleString('es-AR')} / día —{' '}
                  {data.budget.tier.label}
                </p>
              </div>
            </div>
            <Button onClick={goNext} className="w-full">
              Empezar a revisar
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 'highlights' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Camera className="h-4 w-4" />
              ¿Qué es lo más impactante de esta propiedad?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              El sistema identificó <strong>{data.vision.highlights.length} highlights</strong>{' '}
              en la propiedad. Marcá el más importante (el #1 del aviso), pero{' '}
              <strong>vamos a generar 3 anuncios distintos</strong> usando los top 3 —
              Meta va a optimizar entre ellos automáticamente.
              {data.vision.source === 'template' &&
                ' Como no hay análisis con IA configurado, te muestro las opciones derivadas de los amenities.'}
            </p>
            <div className="space-y-2">
              {data.vision.highlights.map((h, idx) => (
                <label
                  key={h.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                    highlightId === h.id
                      ? 'border-[color:var(--brand)] bg-[color:var(--brand)]/5'
                      : idx < 3
                        ? 'border-emerald-200 bg-emerald-50/30 hover:bg-emerald-50/50'
                        : 'hover:bg-muted/30'
                  }`}
                >
                  <input
                    type="radio"
                    name="highlight"
                    checked={highlightId === h.id}
                    onChange={() => setHighlightId(h.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{h.label}</p>
                      {idx < 3 && (
                        <Badge className="bg-emerald-600 text-white text-[10px] h-4">
                          Va al aviso #{idx + 1}
                        </Badge>
                      )}
                      {h.mood && (
                        <Badge variant="outline" className="text-[10px] h-4 capitalize">
                          {h.mood}
                        </Badge>
                      )}
                      {h.impactScore != null && h.impactScore > 0 && (
                        <Badge variant="outline" className="text-[10px] h-4">
                          Impacto {h.impactScore}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{h.reasoning}</p>
                    {h.copyHooks && h.copyHooks.length > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        <span className="font-medium">Datos para el copy:</span>{' '}
                        {h.copyHooks.join(' · ')}
                      </p>
                    )}
                  </div>
                  {data.property.photos[h.photoIndex] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={data.property.photos[h.photoIndex]}
                      alt=""
                      className="h-16 w-20 object-cover rounded shrink-0"
                    />
                  )}
                </label>
              ))}
            </div>
            <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900">
              <strong>Cómo funciona:</strong> los top 3 highlights se convierten en 3
              anuncios distintos dentro de la misma campaña. Cada uno con su propia
              foto, su propio copy y su propia pieza gráfica generada con IA. Meta
              optimiza automáticamente entre ellos.
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Comentario adicional (opcional)
              </label>
              <textarea
                value={highlightNote}
                onChange={e => setHighlightNote(e.target.value)}
                rows={2}
                placeholder="Ej: la pileta es la más grande del edificio, recién renovada en 2025…"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Lo que escribas acá se usa para enriquecer el copy del aviso.
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={goBack} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Atrás
              </Button>
              <Button onClick={goNext} className="flex-1" disabled={!highlightId}>
                Siguiente
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'persona' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Comprador ideal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Acá estamos buscando a esta persona. Si conocés el barrio mejor que el
              sistema y querés ajustar, decime y lo cambio (por ahora la edición de
              persona se hace en el step 4).
            </p>
            <div className="rounded-lg border p-4 space-y-2">
              <p>
                <strong>Edad:</strong> {data.persona.ageRange[0]} – {data.persona.ageRange[1]}{' '}
                años
              </p>
              <p>
                <strong>Nivel:</strong>{' '}
                <span className="capitalize">
                  {data.persona.incomeLevel.replace('_', ' ')}
                </span>
              </p>
              <p>
                <strong>Situación familiar:</strong>{' '}
                <span className="capitalize">
                  {data.persona.familyStatus.replace(/_/g, ' ')}
                </span>
              </p>
              <p>
                <strong>Estilo de vida:</strong> {data.persona.lifestyle.join(', ')}
              </p>
              <p>
                <strong>Cómo le hablamos:</strong>{' '}
                <span className="capitalize">{data.persona.communicationTone}</span>
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={goBack} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Atrás
              </Button>
              <Button onClick={goNext} className="flex-1">
                Está bien, seguir
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'geo' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4" />
              ¿A qué zona le mostramos el aviso?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Tres opciones simples. La recomendada está marcada.
            </p>
            <div className="space-y-2">
              {data.presets.map(p => (
                <label
                  key={p.id}
                  className={`block p-3 rounded-lg border cursor-pointer transition ${
                    geoPresetId === p.id
                      ? 'border-[color:var(--brand)] bg-[color:var(--brand)]/5'
                      : 'hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="geo"
                      checked={geoPresetId === p.id}
                      onChange={() => setGeoPresetId(p.id)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{p.label}</p>
                        {p.id === data.recommendedPreset && (
                          <Badge className="bg-emerald-600 text-white text-[10px] h-4">
                            Recomendado
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
                      <p className="text-xs text-muted-foreground mt-1 font-medium">
                        Alcance estimado: {p.estimatedReach}
                      </p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={goBack} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Atrás
              </Button>
              <Button onClick={goNext} className="flex-1">
                Siguiente
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'creative' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PenTool className="h-4 w-4" />
              Los avisos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Vamos a crear <strong>3 anuncios</strong> distintos. Cada uno con un
              titular y copy específico para su highlight. Vas a ver las 3
              combinaciones abajo — Meta optimiza entre ellos.
            </p>
            <div className="space-y-3">
              {data.copy.primaryTexts.slice(0, 3).map((pt, i) => {
                const linkedHighlight = data.vision.highlights[i]
                return (
                  <div
                    key={i}
                    className="rounded-lg border p-3 space-y-2 bg-card"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="bg-[color:var(--brand)] text-white text-[10px] h-4">
                        Aviso {i + 1}
                      </Badge>
                      {linkedHighlight && (
                        <span className="text-xs text-muted-foreground">
                          Highlight: <strong>{linkedHighlight.label}</strong>
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-sm">
                      {data.copy.headlines[i] ?? data.copy.headlines[0]}
                    </p>
                    <p className="text-xs text-muted-foreground">{pt}</p>
                  </div>
                )
              })}
            </div>
            <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900">
              <strong>Generación de piezas con IA:</strong> al lanzar la campaña, el
              sistema va a generar una pieza gráfica premium con Gemini para cada
              aviso, basada en el highlight correspondiente. Si la generación falla
              o no está habilitada, usa la foto original.
            </div>

            <div className="space-y-1.5 pt-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Presupuesto diario (ARS)
              </label>
              <input
                type="number"
                value={dailyBudget}
                onChange={e => setDailyBudget(Number(e.target.value) || 0)}
                step={500}
                min={1000}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm tabular-num"
              />
              <p className="text-xs text-muted-foreground">{data.budget.reasoning}</p>
            </div>

            <div className="flex gap-2">
              <Button onClick={goBack} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Atrás
              </Button>
              <Button onClick={goNext} className="flex-1">
                Revisar y lanzar
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'launch' && (
        <Card className="border-emerald-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Rocket className="h-4 w-4 text-emerald-700" />
              Listo para lanzar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 space-y-2">
              <p>
                <strong>Propiedad:</strong> {data.property.address}
              </p>
              <p>
                <strong>Mostramos a:</strong>{' '}
                {data.presets.find(p => p.id === geoPresetId)?.label}
              </p>
              <p>
                <strong>Presupuesto:</strong> ARS {dailyBudget.toLocaleString('es-AR')} / día
              </p>
              <p>
                <strong>Landing:</strong>{' '}
                <a
                  href={data.landingUrl}
                  className="underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {data.landingUrl}
                </a>
              </p>
              <div className="border-t border-emerald-200 pt-2 mt-2">
                <p className="font-medium text-xs text-emerald-900 mb-1">
                  3 anuncios que vamos a crear:
                </p>
                <ul className="text-xs text-emerald-900 space-y-1 ml-4 list-disc">
                  {data.vision.highlights.slice(0, 3).map((h, i) => (
                    <li key={h.id}>
                      <strong>Aviso {i + 1}:</strong> {h.label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              La campaña va a quedar <strong>en PAUSADO</strong> en Meta Ads. Cada
              aviso lleva una pieza gráfica generada con IA (si Gemini está habilitado)
              o la foto original. Vas a poder revisar todo en el panel de Meta antes
              de activar. No gasta presupuesto hasta que la actives.
            </p>
            <div className="flex gap-2">
              <Button onClick={goBack} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Atrás
              </Button>
              <Button
                onClick={launch}
                disabled={launching}
                className="flex-1 bg-emerald-700 hover:bg-emerald-800"
              >
                {launching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    Lanzando…
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4 mr-1" />
                    Crear campaña (queda pausada)
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'done' && launchResult && (
        <Card className="border-emerald-300 bg-emerald-50/30">
          <CardContent className="py-8 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
            <h3 className="font-semibold text-lg">¡Campaña creada!</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              La campaña está en Meta Ads en estado <strong>PAUSADO</strong>. Andá a
              Ads Manager para auditarla, ajustar lo que necesites y activarla cuando
              estés conforme.
            </p>
            <div className="space-y-2 max-w-sm mx-auto pt-2">
              <p className="text-xs text-muted-foreground">
                ID de campaña: <code>{launchResult.campaignId}</code>
              </p>
              <Button asChild className="w-full">
                <a
                  href={launchResult.adsManagerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Abrir en Meta Ads Manager
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
