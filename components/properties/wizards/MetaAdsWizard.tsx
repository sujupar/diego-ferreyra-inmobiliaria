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
} from 'lucide-react'

interface VisionData {
  highlights: Array<{ id: string; label: string; reasoning: string; photoIndex: number }>
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

export function MetaAdsWizard({ propertyId }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('overview')
  const [data, setData] = useState<WizardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [launching, setLaunching] = useState(false)

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

  async function launch() {
    setLaunching(true)
    try {
      // El endpoint siempre crea la campaña en PAUSED — no necesita parámetros
      const r = await fetch(`/api/properties/${propertyId}/meta-launch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Error al lanzar campaña')
      setLaunchResult(j)
      setStep('done')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
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
              Esto es lo que el aviso va a destacar. Elegí UNO como protagonista.
              {data.vision.source === 'template' &&
                ' Como no hay análisis con IA configurado, te muestro las opciones derivadas de los amenities.'}
            </p>
            <div className="space-y-2">
              {data.vision.highlights.map(h => (
                <label
                  key={h.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                    highlightId === h.id
                      ? 'border-[color:var(--brand)] bg-[color:var(--brand)]/5'
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
                  <div className="flex-1">
                    <p className="font-medium text-sm">{h.label}</p>
                    <p className="text-xs text-muted-foreground">{h.reasoning}</p>
                  </div>
                  {data.property.photos[h.photoIndex] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={data.property.photos[h.photoIndex]}
                      alt=""
                      className="h-14 w-20 object-cover rounded"
                    />
                  )}
                </label>
              ))}
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
              El aviso
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              El sistema te propone 3 versiones del copy. Elegí cuál preferís —
              también podés ajustar el presupuesto.
            </p>
            <div className="space-y-2">
              {data.copy.primaryTexts.map((pt, i) => (
                <label
                  key={i}
                  className={`block p-3 rounded-lg border cursor-pointer transition ${
                    copyIdx === i
                      ? 'border-[color:var(--brand)] bg-[color:var(--brand)]/5'
                      : 'hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="copy"
                      checked={copyIdx === i}
                      onChange={() => setCopyIdx(i)}
                      className="mt-1"
                    />
                    <div className="flex-1 space-y-1">
                      <p className="font-medium text-sm">
                        {data.copy.headlines[i] ?? data.copy.headlines[0]}
                      </p>
                      <p className="text-xs text-muted-foreground">{pt}</p>
                    </div>
                  </div>
                </label>
              ))}
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
                <strong>Destacamos:</strong>{' '}
                {data.vision.highlights.find(h => h.id === highlightId)?.label}
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
            </div>
            <p className="text-xs text-muted-foreground">
              La campaña va a quedar <strong>en PAUSADO</strong> en Meta Ads. Vas a
              poder revisarla en el panel de Meta antes de activarla. No gasta
              presupuesto hasta que la actives.
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
