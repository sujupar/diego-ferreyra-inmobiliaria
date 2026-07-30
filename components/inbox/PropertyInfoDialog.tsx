'use client'

import { useCallback, useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Image as ImageIcon, Film, Compass, FileText, Link2, CheckCircle2, XCircle, Lock } from 'lucide-react'

/**
 * "Enviar información de la propiedad" (task 9, prioridad 3).
 *
 * Ofrece SOLO lo que la propiedad tenga cargado (fetch a
 * `GET /api/whatsapp/property-info/[propertyId]`), muestra una vista previa
 * real de lo que se va a mandar y pide confirmación explícita antes de
 * disparar nada — nunca manda a ciegas.
 *
 * El envío es una SECUENCIA de llamadas a `POST /api/whatsapp/send` (una por
 * mensaje: intro, cada foto, video, recorrido, cada plano, landing), no un
 * endpoint server-side que arme todo de una — así cada mensaje se loguea
 * individualmente en `whatsapp_messages` (mismo camino que un mensaje normal)
 * y una falla a mitad de camino no dejamos de saber qué SÍ salió.
 */

type Category = 'photos' | 'video' | 'tour' | 'plans' | 'landing'

interface Availability {
  property: { id: string; address: string; title: string | null }
  photos: { available: boolean; count: number; urls: string[] }
  video: { available: boolean; url: string | null }
  tour: { available: boolean; url: string | null }
  plans: { available: boolean; count: number; items: { url: string; label: string }[] }
  landing: { available: boolean; url: string | null }
}

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

interface StepResult {
  label: string
  ok: boolean
  error?: string | null
}

export function PropertyInfoDialog({
  open,
  onOpenChange,
  propertyId,
  phone,
  leadId,
  windowOpen,
  onSent,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  propertyId: string
  phone: string
  leadId: string | null
  windowOpen: boolean
  onSent: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [data, setData] = useState<Availability | null>(null)
  const [checked, setChecked] = useState<Record<Category, boolean>>({
    photos: true, video: true, tour: true, plans: true, landing: true,
  })
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState<StepResult[] | null>(null)
  const [totalSteps, setTotalSteps] = useState(0)

  // Mismo patrón que `loadConversations`/`loadThread` en `WhatsappClient.tsx`:
  // función de carga memoizada, invocada desde el efecto cuando se abre el
  // diálogo. El lint experimental `react-hooks/set-state-in-effect` igual la
  // marca (rastrea el `setLoading(true)` de ADENTRO de la función llamada,
  // algo que no hace de forma consistente con `loadThread` — mismo shape,
  // sin marcar) — se suprime puntualmente: es el arranque intencional del
  // estado "cargando" antes de un fetch, no un efecto en cascada real.
  const loadAvailability = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    setResults(null)
    fetch(`/api/whatsapp/property-info/${propertyId}`)
      .then(res => readJson<{ data?: Availability }>(res).then(body => ({ res, body })))
      .then(({ res, body }) => {
        if (!res.ok) throw new Error(body.error ?? 'No se pudo cargar la información de la propiedad.')
        const avail = body.data ?? null
        setData(avail)
        if (avail) {
          setChecked({
            photos: avail.photos.available,
            video: avail.video.available,
            tour: avail.tour.available,
            plans: avail.plans.available,
            landing: avail.landing.available,
          })
        }
      })
      .catch(err => setLoadError(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [propertyId])

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver comentario de loadAvailability arriba
    loadAvailability()
  }, [open, loadAvailability])

  const nadaDisponible = data
    ? !data.photos.available && !data.video.available && !data.tour.available && !data.plans.available && !data.landing.available
    : false
  const nadaSeleccionado = !Object.values(checked).some(Boolean)

  async function send(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string | null }> {
    const res = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone, leadId, propertyId, ...payload }),
    })
    const body = await readJson<{ ok?: boolean; error?: string }>(res)
    if (!res.ok) return { ok: false, error: body.error ?? `Error ${res.status}` }
    if (body.ok === false) return { ok: false, error: body.error ?? 'WhatsApp rechazó el envío.' }
    return { ok: true }
  }

  async function handleConfirm() {
    if (!data || nadaSeleccionado || sending) return
    setSending(true)

    const steps: { label: string; payload: Record<string, unknown> }[] = []
    steps.push({
      label: 'Mensaje de presentación',
      payload: { type: 'text', text: `Te paso la información de la propiedad: ${data.property.address}` },
    })
    if (checked.photos && data.photos.available) {
      data.photos.urls.forEach((url, i) => {
        steps.push({ label: `Foto ${i + 1}`, payload: { type: 'image', link: url } })
      })
    }
    if (checked.video && data.video.available && data.video.url) {
      steps.push({ label: 'Video', payload: { type: 'video', link: data.video.url } })
    }
    if (checked.tour && data.tour.available && data.tour.url) {
      steps.push({ label: 'Recorrido virtual', payload: { type: 'text', text: `Recorrido virtual: ${data.tour.url}` } })
    }
    if (checked.plans && data.plans.available) {
      data.plans.items.forEach(p => {
        steps.push({ label: `Plano: ${p.label}`, payload: { type: 'document', link: p.url, filename: p.label } })
      })
    }
    if (checked.landing && data.landing.available && data.landing.url) {
      steps.push({
        label: 'Landing de la propiedad',
        payload: { type: 'text', text: `Toda la información en un solo lugar (fotos, video, recorrido y planos): ${data.landing.url}` },
      })
    }

    setTotalSteps(steps.length)
    const done: StepResult[] = []
    for (const step of steps) {
      const r = await send(step.payload)
      done.push({ label: step.label, ok: r.ok, error: r.error })
      setResults([...done])
      if (!r.ok) break // no seguir mandando si algo se cortó (ej. se cerró la ventana a mitad de camino)
    }
    setSending(false)
    onSent()
  }

  const allOk = results !== null && results.length > 0 && results.every(r => r.ok)
  const finished = results !== null && !sending

  return (
    <Dialog open={open} onOpenChange={v => !sending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar información de la propiedad</DialogTitle>
          <DialogDescription>
            {data ? data.property.address : 'Elegí qué mandarle por WhatsApp.'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : loadError ? (
          <p className="text-sm text-[color:var(--destructive)]">{loadError}</p>
        ) : !data ? null : finished ? (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              {allOk ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <XCircle className="h-4 w-4 text-[color:var(--destructive)]" />
              )}
              Se enviaron {results!.filter(r => r.ok).length} de {totalSteps} mensajes.
            </p>
            <ul className="space-y-1 text-xs">
              {results!.map((r, i) => (
                <li key={i} className={r.ok ? 'text-muted-foreground' : 'font-medium text-[color:var(--destructive)]'}>
                  {r.ok ? '✓' : '✗'} {r.label}
                  {!r.ok && r.error ? ` — ${r.error}` : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : !windowOpen ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="h-4 w-4 shrink-0" />
            La ventana de 24 hs está cerrada — WhatsApp no deja mandar mensajes libres. Mandale una plantilla aprobada
            para reabrirla y volvé a intentar acá.
          </p>
        ) : nadaDisponible ? (
          <p className="text-sm text-muted-foreground">
            Esta propiedad todavía no tiene fotos, video, recorrido, planos ni landing cargados.
          </p>
        ) : (
          <div className="space-y-2">
            {data.photos.available && (
              <label className="flex items-start gap-2 rounded-md border p-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={checked.photos}
                  onChange={e => setChecked(c => ({ ...c, photos: e.target.checked }))}
                />
                <div className="flex-1">
                  <span className="flex items-center gap-1.5 font-medium">
                    <ImageIcon className="h-3.5 w-3.5" /> Fotos ({data.photos.count})
                  </span>
                  <div className="mt-1 flex gap-1">
                    {data.photos.urls.map(u => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={u} src={u} alt="" className="h-12 w-12 rounded object-cover" />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">Se mandan las primeras {data.photos.urls.length} (portada).</span>
                </div>
              </label>
            )}
            {data.video.available && (
              <label className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <input type="checkbox" checked={checked.video} onChange={e => setChecked(c => ({ ...c, video: e.target.checked }))} />
                <span className="flex items-center gap-1.5 font-medium">
                  <Film className="h-3.5 w-3.5" /> Video
                </span>
              </label>
            )}
            {data.tour.available && (
              <label className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <input type="checkbox" checked={checked.tour} onChange={e => setChecked(c => ({ ...c, tour: e.target.checked }))} />
                <span className="flex items-center gap-1.5 font-medium">
                  <Compass className="h-3.5 w-3.5" /> Recorrido virtual
                </span>
              </label>
            )}
            {data.plans.available && (
              <label className="flex items-start gap-2 rounded-md border p-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={checked.plans}
                  onChange={e => setChecked(c => ({ ...c, plans: e.target.checked }))}
                />
                <div>
                  <span className="flex items-center gap-1.5 font-medium">
                    <FileText className="h-3.5 w-3.5" /> Planos ({data.plans.count})
                  </span>
                  <span className="text-xs text-muted-foreground">{data.plans.items.map(p => p.label).join(', ')}</span>
                </div>
              </label>
            )}
            {data.landing.available && (
              <label className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <input type="checkbox" checked={checked.landing} onChange={e => setChecked(c => ({ ...c, landing: e.target.checked }))} />
                <span className="flex items-center gap-1.5 font-medium">
                  <Link2 className="h-3.5 w-3.5" /> Landing publicada
                </span>
              </label>
            )}
          </div>
        )}

        <DialogFooter>
          {finished ? (
            <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
                Cancelar
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!data || nadaDisponible || nadaSeleccionado || !windowOpen || sending || Boolean(loadError)}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar y enviar'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
