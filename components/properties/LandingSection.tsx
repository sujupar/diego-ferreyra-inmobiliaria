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
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles, Rocket, ExternalLink, Wand2, ArrowRight, AlertTriangle, Trash2 } from 'lucide-react'
import { needsDeliveryChoice, resolveDeliverMedia } from '@/lib/properties/deliver-media'
import { ENRICH_STAGES, nextEnrichStage } from '@/lib/landing/enrich'
import { faltanRespuestas, GATE_RESPUESTAS_MSG } from '@/lib/landing/answers-gate'

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
  /** Etapa pendiente del enriquecimiento con IA; ausente = ya está completa. */
  enrich?: 'vision' | 'location' | 'description' | 'avatars' | 'copy' | 'done'
  /** true = los textos se generaron con las respuestas del asesor (gate de publicar). */
  copyFromAnswers?: boolean
}
interface Landing {
  status: 'draft' | 'published' | 'archived'
  template_id: string
  public_slug: string | null
  wizard_state: WizardState
}
interface TemplateMeta { id: string; label: string; description: string; bestFor: string }

/**
 * Lee la respuesta como JSON tolerando que NO lo sea.
 *
 * Cuando una función se pasa del tiempo máximo, el gateway devuelve una página
 * HTML de error: `res.json()` explotaba con "Unexpected token '<', "<HTML>..."
 * —un mensaje que no le dice nada a nadie— en vez del problema real.
 */
async function readJson<T>(res: Response): Promise<T & { error?: string }> {
  const text = await res.text()
  try {
    return JSON.parse(text) as T & { error?: string }
  } catch {
    if (res.status === 504 || res.status === 502 || res.status === 408) {
      return { error: 'El servidor tardó demasiado y cortó la operación. Volvé a intentar.' } as never
    }
    return { error: `El servidor respondió algo inesperado (${res.status}). Volvé a intentar.` } as never
  }
}

interface LandingSectionProps {
  propertyId: string
  videoRecorridoUrl?: string | null
  tour3dUrl?: string | null
  /** Video "de marketing" de la propiedad — cuenta como entregable de respaldo (2026-08-02). */
  videoUrl?: string | null
  videoFileUrl?: string | null
  deliverMediaSaved?: string | null
}

export function LandingSection({
  propertyId, videoRecorridoUrl, tour3dUrl, videoUrl, videoFileUrl, deliverMediaSaved,
}: LandingSectionProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [landing, setLanding] = useState<Landing | null>(null)
  const [templates, setTemplates] = useState<TemplateMeta[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [refineComment, setRefineComment] = useState('')
  const [deliverMedia, setDeliverMedia] = useState<string | null>(deliverMediaSaved ?? null)
  const [enriching, setEnriching] = useState<{ label: string; percent: number } | null>(null)

  useEffect(() => { setDeliverMedia(deliverMediaSaved ?? null) }, [deliverMediaSaved])

  const mediaFields = {
    video_recorrido_url: videoRecorridoUrl,
    tour_3d_url: tour3dUrl,
    video_url: videoUrl,
    video_file_url: videoFileUrl,
  }
  const showDeliveryChoice = needsDeliveryChoice(mediaFields)

  // Sin NINGÚN entregable no se puede publicar: el servidor lo rechaza igual
  // (`assertRecorridoDisponible`), acá lo avisamos antes de que el asesor
  // apriete el botón. Desde 2026-08-02 el video propio de la propiedad
  // también cuenta (`resolveDeliverMedia` ya contempla el fallback).
  const faltaRecorrido = resolveDeliverMedia(mediaFields).kind === 'fotos'

  const chooseDeliverMedia = async (choice: 'video_recorrido' | 'tour_3d' | 'video_propio') => {
    setDeliverMedia(choice)
    setBusy('deliverMedia')
    try {
      const res = await fetch(`/api/properties/${propertyId}/landing`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deliverMedia: choice }),
      })
      const data = await readJson<{ error?: string }>(res)
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
      const data = await readJson<{ landing?: Landing; templates?: TemplateMeta[] }>(res)
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

  /**
   * Corre las etapas de IA de a una hasta terminar, mostrando el progreso.
   * Cada etapa es su propio request: si una falla, se reintenta sola sin volver
   * a pagar las anteriores. El tope de vueltas es un seguro anti-loop.
   */
  const runEnrichment = useCallback(async (): Promise<void> => {
    for (let i = 0; i < ENRICH_STAGES.length + 2; i++) {
      const res = await fetch(`/api/properties/${propertyId}/landing/enrich`, { method: 'POST' })
      const data = await readJson<{
        landing?: Landing; stage?: string; label?: string; percent?: number; done?: boolean; error?: string
      }>(res)
      if (!res.ok) throw new Error(data.error ?? 'Error al generar con IA')
      if (data.landing) setLanding(data.landing ?? null)
      if (data.done) { setEnriching(null); return }
      setEnriching({ label: data.label ?? 'Generando…', percent: data.percent ?? 0 })
    }
    setEnriching(null)
  }, [propertyId])

  const start = async () => {
    setBusy('start')
    // El POST de creación ya no hace IA: vuelve en ~1s con la landing lista para
    // trabajar. El enriquecimiento (Vision → avatares → textos) va después, de a
    // una etapa, para no pasarse del tiempo máximo de la función.
    setEnriching({ label: 'Creando la landing…', percent: 5 })
    try {
      const res = await fetch(`/api/properties/${propertyId}/landing`, { method: 'POST' })
      const data = await readJson<{ landing?: Landing; templates?: TemplateMeta[]; error?: string }>(res)
      if (!res.ok) throw new Error(data.error ?? 'Error al crear la landing')
      // Este handler corre su propio loop; el efecto de resume no debe duplicarlo.
      // Se marca ANTES del setLanding: al cambiar `landing` el efecto se vuelve a
      // evaluar, y una landing recién creada nace con `enrich='vision'` (no 'done'),
      // así que sin esta línea arrancaba un SEGUNDO loop en paralelo y CADA etapa
      // de IA se pagaba dos veces (2× Gemini Vision sobre las fotos, 2× créditos
      // de ScraperAPI para la zona, 2× descripción, 2× avatares) sin que nada se
      // viera raro en pantalla.
      resumedRef.current = true
      setLanding(data.landing ?? null); setTemplates(data.templates ?? [])
      await runEnrichment()
      toast.success('Landing creada. Respondé las preguntas para generar los textos.')
    } catch (e) {
      setEnriching(null)
      toast.error(e instanceof Error ? e.message : 'Error al crear la landing')
    } finally { setBusy(null) }
  }

  /**
   * Si el asesor recargó la página a mitad del enriquecimiento, lo retomamos
   * solo. El ref evita que un re-render dispare un segundo loop — y se marca
   * TAMBIÉN cuando la landing ya está completa al cargar: sin eso, el re-armado
   * de la etapa copy (respuestas / avatar / diseño) re-disparaba este efecto en
   * paralelo con el loop del handler → DOS llamadas de IA por el mismo copy
   * (hallazgo del review 2026-08-06). Los handlers marcan el ref antes de correr.
   */
  const resumedRef = useRef(false)
  useEffect(() => {
    if (loading || !landing || resumedRef.current) return
    resumedRef.current = true
    if (nextEnrichStage(landing.wizard_state ?? {}) === 'done') return
    setEnriching({ label: 'Retomando la generación…', percent: 5 })
    runEnrichment().catch(e => {
      setEnriching(null)
      toast.error(e instanceof Error ? e.message : 'Error al generar con IA')
    })
  }, [loading, landing, runEnrichment])

  /**
   * Guarda las respuestas (el server exige TODAS), regenera avatares y corre la
   * etapa de textos re-armada: al terminar, la landing tiene el copy hecho CON
   * las respuestas — recién ahí se habilita publicar.
   */
  const saveAnswers = async () => {
    setBusy('answers')
    resumedRef.current = true // este handler corre su propio loop; el efecto de resume no debe duplicarlo
    try {
      const res = await fetch(`/api/properties/${propertyId}/landing/answers`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      const data = await readJson<{ landing?: Landing; error?: string }>(res)
      if (!res.ok) throw new Error(data.error)
      setLanding(data.landing ?? null)
      setEnriching({ label: 'Escribiendo los textos de la landing…', percent: 90 })
      await runEnrichment()
      toast.success('Listo: los textos se generaron con tus respuestas.')
    } catch (e) {
      setEnriching(null)
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally { setBusy(null) }
  }

  /**
   * Si los textos ya se generaron y el asesor cambia (o ajusta) el avatar o el
   * diseño, se re-generan para que sigan a la elección — sin esto el copy
   * publicado quedaba atado al avatar [0] o el cambio de diseño lo pisaba con
   * el determinístico dejando el gate en verde.
   */
  const regenerarTextosSiCorresponde = async (tenianTextos: boolean, label: string) => {
    if (!tenianTextos) return
    resumedRef.current = true // el loop lo corre este handler, no el efecto de resume
    const ok = await patch({ wizardState: { enrich: 'copy', copyFromAnswers: false } })
    if (!ok) return // el PATCH falló (ya se mostró el toast): no simular que se regeneró
    setEnriching({ label, percent: 90 })
    try {
      await runEnrichment()
    } catch (e) {
      setEnriching(null)
      toast.error(e instanceof Error ? e.message : 'Error al actualizar los textos')
    }
  }

  const selectAvatar = async (idx: number) => {
    // Re-clickear el avatar ya elegido no regenera nada (cada regeneración es IA paga).
    if (idx === (landing?.wizard_state?.selectedAvatarIndex ?? 0)) return
    const tenianTextos = landing?.wizard_state?.copyFromAnswers === true
    const ok = await patch({ wizardState: { selectedAvatarIndex: idx } })
    if (!ok) return
    await regenerarTextosSiCorresponde(tenianTextos, 'Actualizando los textos con el avatar elegido…')
  }

  const refine = async (idx: number) => {
    if (!refineComment.trim()) return
    setBusy('refine')
    try {
      const res = await fetch(`/api/properties/${propertyId}/landing/avatar-refine`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ avatarIndex: idx, comment: refineComment }),
      })
      const data = await readJson<{ landing?: Landing; error?: string }>(res)
      if (!res.ok) throw new Error(data.error)
      const tenianTextos = landing?.wizard_state?.copyFromAnswers === true
      setLanding(data.landing ?? null); setRefineComment('')
      toast.success('Avatar ajustado.')
      await regenerarTextosSiCorresponde(tenianTextos, 'Actualizando los textos con el avatar ajustado…')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally { setBusy(null) }
  }

  const patch = async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy('patch')
    try {
      const res = await fetch(`/api/properties/${propertyId}/landing`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await readJson<{ landing?: Landing; error?: string }>(res)
      if (!res.ok) throw new Error(data.error)
      setLanding(data.landing ?? null)
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
      return false
    } finally { setBusy(null) }
  }

  /**
   * Cambiar el diseño reconstruye el content; si los textos ya salían de las
   * respuestas, el server re-arma la etapa copy y acá se corre el loop para que
   * el nuevo diseño también los tenga (el gate queda cerrado hasta entonces).
   */
  const setTemplate = async (templateId: string) => {
    const tenianTextos = landing?.wizard_state?.copyFromAnswers === true
    resumedRef.current = true
    const ok = await patch({ templateId })
    if (!ok || !tenianTextos) return
    setEnriching({ label: 'Escribiendo los textos para el nuevo diseño…', percent: 90 })
    try {
      await runEnrichment()
    } catch (e) {
      setEnriching(null)
      toast.error(e instanceof Error ? e.message : 'Error al actualizar los textos')
    }
  }

  const publish = async () => {
    setBusy('publish')
    try {
      const res = await fetch(`/api/properties/${propertyId}/landing/publish`, { method: 'POST' })
      const data = await readJson<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error)
      toast.success('Landing publicada. Ya podés montar la campaña Meta.')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al publicar')
    } finally { setBusy(null) }
  }

  /**
   * Elimina la landing DE VERDAD para poder generarla de cero (pedido del
   * usuario, 2026-08-07). El enlace público no se rompe: mientras no haya
   * landing muestra la versión automática, y al re-publicar conserva el MISMO
   * enlace (el slug vive en la propiedad) — una campaña Meta activa sigue
   * funcionando durante el medio.
   */
  const eliminar = async () => {
    const publicada = landing?.status === 'published'
    const aviso = publicada
      ? 'Vas a eliminar esta landing publicada para generarla de nuevo.\n\n' +
        '• El enlace público NO se rompe: mientras tanto muestra una versión automática, y la landing nueva va a tener el MISMO enlace (las campañas Meta siguen funcionando).\n' +
        '• Los textos actuales y las respuestas se pierden: la nueva arranca de cero con las preguntas.\n\n¿Eliminar?'
      : 'Vas a eliminar esta landing en construcción (textos, respuestas y avatares del asistente). Después podés crearla de nuevo desde cero. ¿Eliminar?'
    if (!confirm(aviso)) return
    setBusy('eliminar')
    try {
      const res = await fetch(`/api/properties/${propertyId}/landing?definitivo=1`, { method: 'DELETE' })
      const data = await readJson<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error)
      setLanding(null)
      setAnswers({})
      setEnriching(null)
      resumedRef.current = false
      toast.success('Landing eliminada. Podés crearla de nuevo cuando quieras.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al eliminar')
    } finally { setBusy(null) }
  }

  if (loading) {
    return <Card><CardContent className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></CardContent></Card>
  }

  /**
   * Progreso del enriquecimiento. Es visible en la tarjeta de creación y en el
   * wizard: la landing ya existe y se puede mirar mientras la IA la completa.
   */
  const enrichBlock = enriching ? (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-[color:var(--brand)]" />
        <p className="text-sm font-medium">{enriching.label}</p>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-[color:var(--brand)] transition-all duration-500"
          style={{ width: `${enriching.percent}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Tarda un minuto. Podés quedarte acá; si te vas y volvés, sigue donde quedó.
      </p>
    </div>
  ) : null

  /**
   * Elección de qué se entrega (solo si la propiedad tiene DOS O MÁS
   * candidatos — ver `needsDeliveryChoice`). Desde 2026-08-02 el video propio
   * de la propiedad (`video_url`/`video_file_url`) también puede competir.
   * Se renderiza tanto en el wizard como en la tarjeta de landing publicada: el
   * caso más común es subir el video recorrido DESPUÉS de publicar, y si el
   * bloque viviera solo en el draft el asesor nunca podría elegir.
   */
  const tieneVideoPropio = Boolean((videoFileUrl ?? videoUrl ?? '').trim())
  const deliveryChoiceBlock = showDeliveryChoice ? (
    <div className="space-y-2">
      <p className="text-sm font-medium">¿Qué le enviamos a quien se registre?</p>
      <p className="text-xs text-muted-foreground">Se le manda por WhatsApp para que conozca la propiedad por dentro.</p>
      <div className="grid gap-3 md:grid-cols-3">
        {Boolean((videoRecorridoUrl ?? '').trim()) && (
          <button
            onClick={() => chooseDeliverMedia('video_recorrido')}
            disabled={busy === 'deliverMedia'}
            className={`text-left p-3 rounded-lg border-2 transition ${deliverMedia === 'video_recorrido' ? 'border-[color:var(--brand)] bg-[color:var(--brand)]/5' : 'border-border hover:bg-muted/30'}`}
          >
            <p className="text-sm font-semibold">Video recorrido</p>
          </button>
        )}
        {Boolean((tour3dUrl ?? '').trim()) && (
          <button
            onClick={() => chooseDeliverMedia('tour_3d')}
            disabled={busy === 'deliverMedia'}
            className={`text-left p-3 rounded-lg border-2 transition ${deliverMedia === 'tour_3d' ? 'border-[color:var(--brand)] bg-[color:var(--brand)]/5' : 'border-border hover:bg-muted/30'}`}
          >
            <p className="text-sm font-semibold">Recorrido virtual 3D</p>
          </button>
        )}
        {tieneVideoPropio && (
          <button
            onClick={() => chooseDeliverMedia('video_propio')}
            disabled={busy === 'deliverMedia'}
            className={`text-left p-3 rounded-lg border-2 transition ${deliverMedia === 'video_propio' ? 'border-[color:var(--brand)] bg-[color:var(--brand)]/5' : 'border-border hover:bg-muted/30'}`}
          >
            <p className="text-sm font-semibold">Video de la propiedad</p>
          </button>
        )}
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
          {enrichBlock}
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
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => router.push(`/properties/${propertyId}/landing/edit`)}>
              Editar landing
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
              onClick={eliminar}
              disabled={busy === 'eliminar'}
            >
              {busy === 'eliminar' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Eliminar landing
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Eliminar sirve para generarla de nuevo desde cero. El enlace público no se rompe y la landing nueva conserva el mismo enlace.
          </p>
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

  // Gate de publicación (2026-08-06): con preguntas presentes, publicar exige
  // TODAS respondidas Y los textos generados con esas respuestas. El server
  // valida lo mismo en publishLanding — acá solo lo avisamos antes.
  const faltanLocal = questions.filter(q => !(answers[q.id] ?? '').trim())
  const textosListos = questions.length === 0 ||
    (faltanRespuestas({ questions, answers: ws.answers }).length === 0 && ws.copyFromAnswers === true)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" />Landing Page — en construcción</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {enrichBlock}

        {/* 1. Preguntas (obligatorias, 2026-08-06: son el insumo de los textos) */}
        {questions.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium">1. Contanos de esta propiedad (obligatorio)</p>
            <p className="text-xs text-muted-foreground">
              Con tus respuestas la IA escribe los textos de la landing. Sin responderlas no se puede publicar.
            </p>
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
            <Button size="sm" onClick={saveAnswers} disabled={busy === 'answers' || faltanLocal.length > 0}>
              {busy === 'answers' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
              Generar los textos con mis respuestas
            </Button>
            {faltanLocal.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Respondé todas las preguntas para generar los textos de la landing.
              </p>
            )}
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
          {faltaRecorrido && (
            <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-900">Falta el recorrido</p>
                <p className="text-xs text-amber-800">
                  A quien se registre le prometemos un recorrido de la propiedad. Cargá un{' '}
                  <strong>video recorrido</strong>, un <strong>recorrido virtual</strong> o, al menos,{' '}
                  un <strong>video</strong> en la pestaña Multimedia para poder publicar.
                </p>
              </div>
            </div>
          )}
          {!textosListos && (
            <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-900">Faltan tus respuestas</p>
                <p className="text-xs text-amber-800">{GATE_RESPUESTAS_MSG}</p>
              </div>
            </div>
          )}
          <Button
            onClick={publish}
            disabled={busy === 'publish' || faltaRecorrido || !textosListos}
            className="w-full"
            size="lg"
          >
            {busy === 'publish' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
            Publicar landing
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>

        {/* Eliminar y arrancar de cero (2026-08-07) */}
        <div className="border-t pt-3">
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={eliminar}
            disabled={busy === 'eliminar'}
          >
            {busy === 'eliminar' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
            Eliminar y empezar de nuevo
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
