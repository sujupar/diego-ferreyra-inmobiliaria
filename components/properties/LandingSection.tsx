'use client'

/**
 * E1.4 — Sección "Landing Page" (co-creación) en el detalle de propiedad.
 *
 * Flujo: crear con IA → responder preguntas → elegir avatar → elegir template →
 * previsualizar → publicar. Al publicar, la propiedad queda con landing pública
 * (slug + UTM congelados) → habilita montar la campaña Meta (gate E2.1).
 *
 * Versión funcional; el editor drag-and-drop premium es E1.6.
 */
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles, Rocket, ExternalLink, Wand2, ArrowRight } from 'lucide-react'
import { needsDeliveryChoice } from '@/lib/properties/deliver-media'

interface Question { id: string; question: string; hint?: string }
interface Avatar {
  id: string; shortLabel: string; ageRange?: string; occupation?: string
  motivation?: string; hooks?: string[]
  empathyMap?: { says?: string[]; thinks?: string[]; feels?: string[]; does?: string[] }
  pains?: string[]; gains?: string[]
}
interface WizardState {
  step?: string
  questions?: Question[]
  answers?: Record<string, string>
  avatarCandidates?: Avatar[]
  selectedAvatarIndex?: number
}
interface Landing {
  status: 'draft' | 'published' | 'archived'
  template_id: string
  public_slug: string | null
  wizard_state: WizardState
}
interface TemplateMeta { id: string; label: string; description: string; bestFor: string }

interface LandingSectionProps {
  propertyId: string
  videoRecorridoUrl?: string | null
  tour3dUrl?: string | null
  deliverMediaSaved?: string | null
}

export function LandingSection({ propertyId, videoRecorridoUrl, tour3dUrl, deliverMediaSaved }: LandingSectionProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [landing, setLanding] = useState<Landing | null>(null)
  const [templates, setTemplates] = useState<TemplateMeta[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [refineComment, setRefineComment] = useState('')
  const [deliverMedia, setDeliverMedia] = useState<string | null>(deliverMediaSaved ?? null)

  useEffect(() => { setDeliverMedia(deliverMediaSaved ?? null) }, [deliverMediaSaved])

  const showDeliveryChoice = needsDeliveryChoice({
    video_recorrido_url: videoRecorridoUrl,
    tour_3d_url: tour3dUrl,
  })

  const chooseDeliverMedia = async (choice: 'video_recorrido' | 'tour_3d') => {
    setDeliverMedia(choice)
    setBusy('deliverMedia')
    try {
      const res = await fetch(`/api/properties/${propertyId}/landing`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deliverMedia: choice }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Guardado.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar')
    } finally { setBusy(null) }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}/landing`)
      const data = await res.json()
      if (res.ok) {
        setLanding(data.landing ?? null)
        setTemplates(data.templates ?? [])
        if (data.landing?.wizard_state?.answers) setAnswers(data.landing.wizard_state.answers)
      }
    } finally {
      setLoading(false)
    }
  }, [propertyId])

  useEffect(() => { load() }, [load])

  const start = async () => {
    setBusy('start')
    try {
      const res = await fetch(`/api/properties/${propertyId}/landing`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLanding(data.landing); setTemplates(data.templates ?? [])
      toast.success('Landing creada. Respondé las preguntas para afinar el avatar.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al crear la landing')
    } finally { setBusy(null) }
  }

  const saveAnswers = async () => {
    setBusy('answers')
    try {
      const res = await fetch(`/api/properties/${propertyId}/landing/answers`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLanding(data.landing)
      toast.success('Avatares regenerados con tus respuestas.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally { setBusy(null) }
  }

  const selectAvatar = async (idx: number) => {
    await patch({ wizardState: { selectedAvatarIndex: idx } })
  }

  const refine = async (idx: number) => {
    if (!refineComment.trim()) return
    setBusy('refine')
    try {
      const res = await fetch(`/api/properties/${propertyId}/landing/avatar-refine`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ avatarIndex: idx, comment: refineComment }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLanding(data.landing); setRefineComment('')
      toast.success('Avatar ajustado.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally { setBusy(null) }
  }

  const patch = async (body: Record<string, unknown>) => {
    setBusy('patch')
    try {
      const res = await fetch(`/api/properties/${propertyId}/landing`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLanding(data.landing)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally { setBusy(null) }
  }

  const setTemplate = (templateId: string) => patch({ templateId })

  const publish = async () => {
    setBusy('publish')
    try {
      const res = await fetch(`/api/properties/${propertyId}/landing/publish`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Landing publicada. Ya podés montar la campaña Meta.')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al publicar')
    } finally { setBusy(null) }
  }

  if (loading) {
    return <Card><CardContent className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></CardContent></Card>
  }

  /**
   * Elección de qué recorrido se entrega (solo si la propiedad tiene los dos).
   * Se renderiza tanto en el wizard como en la tarjeta de landing publicada: el
   * caso más común es subir el video recorrido DESPUÉS de publicar, y si el
   * bloque viviera solo en el draft el asesor nunca podría elegir.
   */
  const deliveryChoiceBlock = showDeliveryChoice ? (
    <div className="space-y-2">
      <p className="text-sm font-medium">¿Qué le enviamos a quien se registre?</p>
      <p className="text-xs text-muted-foreground">Se le manda por WhatsApp para que conozca la propiedad por dentro.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <button
          onClick={() => chooseDeliverMedia('video_recorrido')}
          disabled={busy === 'deliverMedia'}
          className={`text-left p-3 rounded-lg border-2 transition ${deliverMedia === 'video_recorrido' ? 'border-[color:var(--brand)] bg-[color:var(--brand)]/5' : 'border-border hover:bg-muted/30'}`}
        >
          <p className="text-sm font-semibold">Video recorrido</p>
        </button>
        <button
          onClick={() => chooseDeliverMedia('tour_3d')}
          disabled={busy === 'deliverMedia'}
          className={`text-left p-3 rounded-lg border-2 transition ${deliverMedia === 'tour_3d' ? 'border-[color:var(--brand)] bg-[color:var(--brand)]/5' : 'border-border hover:bg-muted/30'}`}
        >
          <p className="text-sm font-semibold">Recorrido virtual 3D</p>
        </button>
      </div>
    </div>
  ) : null

  // --- Sin landing: CTA de creación ---
  if (!landing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" />Landing Page</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Creá una landing de conversión para esta propiedad. La IA analiza las fotos y la descripción,
            te hace unas preguntas y arma el avatar del comprador. Es requisito para montar la campaña Meta.
          </p>
          <Button onClick={start} disabled={busy === 'start'}>
            {busy === 'start' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
            Crear landing con IA
          </Button>
        </CardContent>
      </Card>
    )
  }

  // --- Publicada ---
  if (landing.status === 'published' && landing.public_slug) {
    const url = `/p/${landing.public_slug}`
    return (
      <Card className="border-emerald-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Rocket className="h-4 w-4 text-emerald-700" />Landing publicada</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm">
            <p className="text-muted-foreground">Enlace público</p>
            <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-800 flex items-center gap-1">
              {url} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <p className="text-xs text-muted-foreground">Ya podés montar la campaña Meta para esta propiedad.</p>
          <Button size="sm" onClick={() => router.push(`/properties/${propertyId}/landing/edit`)}>
            Editar landing
          </Button>
          {deliveryChoiceBlock && <div className="border-t pt-3">{deliveryChoiceBlock}</div>}
        </CardContent>
      </Card>
    )
  }

  // --- Draft: wizard de co-creación ---
  const ws = landing.wizard_state ?? {}
  const questions = ws.questions ?? []
  const candidates = ws.avatarCandidates ?? []
  const selectedIdx = ws.selectedAvatarIndex ?? 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" />Landing Page — en construcción</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 1. Preguntas */}
        {questions.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium">1. Afiná el perfil (opcional)</p>
            {questions.map(q => (
              <div key={q.id}>
                <label className="text-sm">{q.question}</label>
                {q.hint && <p className="text-xs text-muted-foreground">{q.hint}</p>}
                <textarea
                  value={answers[q.id] ?? ''}
                  onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                  rows={2}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm mt-1"
                />
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={saveAnswers} disabled={busy === 'answers'}>
              {busy === 'answers' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Regenerar avatares con mis respuestas
            </Button>
          </div>
        )}

        {/* 2. Avatares */}
        {candidates.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium">2. Elegí el avatar del comprador</p>
            <div className="grid gap-3 md:grid-cols-3">
              {candidates.map((a, i) => (
                <button
                  key={a.id + i}
                  onClick={() => selectAvatar(i)}
                  className={`text-left p-3 rounded-lg border-2 transition ${i === selectedIdx ? 'border-[color:var(--brand)] bg-[color:var(--brand)]/5' : 'border-border hover:bg-muted/30'}`}
                >
                  <p className="text-sm font-semibold">{a.shortLabel}</p>
                  <p className="text-xs text-muted-foreground">{a.ageRange} · {a.occupation}</p>
                  {a.empathyMap?.feels?.length ? (
                    <p className="text-xs mt-1"><span className="text-muted-foreground">Siente:</span> {a.empathyMap.feels.slice(0, 2).join(', ')}</p>
                  ) : null}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={refineComment}
                onChange={e => setRefineComment(e.target.value)}
                placeholder="Ajustá el avatar elegido (ej: más enfocado en inversores)"
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
              />
              <Button size="sm" variant="outline" onClick={() => refine(selectedIdx)} disabled={busy === 'refine' || !refineComment.trim()}>
                {busy === 'refine' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ajustar'}
              </Button>
            </div>
          </div>
        )}

        {/* 3. Template */}
        <div className="space-y-3">
          <p className="text-sm font-medium">3. Elegí el diseño</p>
          <div className="grid gap-3 md:grid-cols-2">
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => setTemplate(t.id)}
                className={`text-left p-3 rounded-lg border-2 transition ${t.id === landing.template_id ? 'border-[color:var(--brand)] bg-[color:var(--brand)]/5' : 'border-border hover:bg-muted/30'}`}
              >
                <p className="text-sm font-semibold">{t.label}</p>
                <p className="text-xs text-muted-foreground">{t.description}</p>
                <p className="text-xs mt-1 text-muted-foreground">Ideal: {t.bestFor}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Elegir qué recorrido se entrega (solo si la propiedad tiene los dos) */}
        {deliveryChoiceBlock}

        {/* 4. Publicar */}
        <div className="border-t pt-4 space-y-2">
          <p className="text-sm font-medium">4. Publicar</p>
          <p className="text-xs text-muted-foreground">
            Al publicar, la propiedad tendrá su enlace público y quedará lista para la campaña Meta.
            El enlace no cambia aunque después edites el diseño.
          </p>
          <Button onClick={publish} disabled={busy === 'publish'} className="w-full" size="lg">
            {busy === 'publish' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
            Publicar landing
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
