'use client'

/**
 * E1.8 — Captura de leads por POPUP (no formulario al pie).
 *
 * Provee `useLeadCapture().open()` a los CTAs de la landing (que son client
 * components dentro del árbol, aunque los envuelvan server components — el
 * contexto de un provider client SÍ llega a los client components descendientes).
 * Renderiza un modal accesible con nombre / email / teléfono / intención, y
 * reusa el mismo submit que el form legacy (POST /api/leads + Pixel/CAPI dedup).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Loader2, CheckCircle2, X } from 'lucide-react'
import { trackLead, getMetaCookie } from './MetaPixel'

interface LeadCaptureCtx {
  open: (source?: string) => void
  /** true si esta persona YA dejó sus datos (desbloquea la galería completa). */
  unlocked: boolean
}
const Ctx = createContext<LeadCaptureCtx | null>(null)

export function useLeadCapture(): LeadCaptureCtx {
  const ctx = useContext(Ctx)
  // Fallback no-op: si por algún motivo un CTA queda fuera del provider, no
  // rompe (mejor un botón inerte que un crash en una landing en vivo).
  return ctx ?? { open: () => {}, unlocked: false }
}

/** Clave por propiedad: registrarse en una no desbloquea las demás. */
const unlockKey = (propertyId: string) => `df_lead_${propertyId}`

/** Source que usa la galería bloqueada (define el copy del popup). */
export const GALLERY_LOCK_SOURCE = 'galeria_bloqueada'

interface FormState {
  name: string
  email: string
  phone: string
  intent: string
}
const INITIAL: FormState = { name: '', email: '', phone: '', intent: 'Coordinar una visita' }
const INTENTS = ['Coordinar una visita', 'Que me contacten', 'Recibir más información']

function getUtmFromUrl(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const params = new URLSearchParams(window.location.search)
  const utm: Record<string, string> = {}
  for (const [k, v] of params.entries()) {
    if (k.startsWith('utm_') || k.startsWith('fb_') || k === 'fbclid' || k === 'gclid') utm[k] = v
  }
  return utm
}

export function LeadCaptureProvider({
  propertyId,
  propertyTitle,
  children,
}: {
  propertyId: string
  propertyTitle: string
  children: ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [source, setSource] = useState<string>('cta')
  // Arranca SIEMPRE en false (igual que el server) y se levanta después de
  // montar: si se leyera localStorage durante el render habría hydration
  // mismatch. El costo es un parpadeo mínimo en la galería ya desbloqueada.
  const [unlocked, setUnlocked] = useState(false)
  const [form, setForm] = useState<FormState>(INITIAL)
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const submittingRef = useRef(false)
  const firstFieldRef = useRef<HTMLInputElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  // Guarda el CTA que abrió el popup para DEVOLVERLE el foco al cerrar (WCAG 2.4.3).
  const triggerRef = useRef<HTMLElement | null>(null)
  // Anti-spam: honeypot (campo oculto que solo un bot llena).
  const [honeypot, setHoneypot] = useState('')

  const open = useCallback((src?: string) => {
    if (typeof document !== 'undefined') {
      triggerRef.current = document.activeElement as HTMLElement | null
    }
    setSource(src ?? 'cta')
    setStatus('idle')
    setErrorMsg('')
    setIsOpen(true)
  }, [])

  // ¿Ya se registró en una visita anterior? Se lee después de montar (ver arriba).
  useEffect(() => {
    try {
      if (window.localStorage.getItem(unlockKey(propertyId)) === '1') setUnlocked(true)
    } catch {
      /* localStorage bloqueado (modo privado / cookies off) → sigue bloqueada */
    }
  }, [propertyId])

  const ctxValue = useMemo(() => ({ open, unlocked }), [open, unlocked])

  const close = useCallback(() => setIsOpen(false), [])

  // Bloquea el scroll del fondo + cierra con ESC + foco al primer campo + al
  // cerrar devuelve el foco al CTA disparador.
  useEffect(() => {
    if (!isOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    const t = setTimeout(() => firstFieldRef.current?.focus(), 40)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
      clearTimeout(t)
      // Devolver el foco al disparador (si sigue en el DOM).
      triggerRef.current?.focus?.()
    }
  }, [isOpen, close])

  // Al pasar a "enviado", mover el foco al botón Cerrar (el submit se desmontó).
  useEffect(() => {
    if (isOpen && status === 'ok') closeBtnRef.current?.focus()
  }, [isOpen, status])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (submittingRef.current) return
    // Anti-spam: SOLO honeypot (un humano nunca llena el campo _company oculto).
    // No usamos gate temporal: marcaba como bot a humanos con el form
    // pre-cargado/autofill y descartaba el lead con un falso éxito.
    if (honeypot.trim()) {
      setStatus('ok')
      return
    }
    if (!form.name.trim() || (!form.email.trim() && !form.phone.trim())) {
      setStatus('err')
      setErrorMsg('Necesitamos tu nombre y al menos un contacto (email o teléfono).')
      return
    }
    submittingRef.current = true
    setStatus('sending')
    setErrorMsg('')
    const eventId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          name: form.name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          message: `${form.intent}${source ? ` · ${source}` : ''}`,
          utm: getUtmFromUrl(),
          eventId,
          fbp: getMetaCookie('_fbp'),
          fbc: getMetaCookie('_fbc'),
          eventSourceUrl: typeof window !== 'undefined' ? window.location.href : null,
        }),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Error' }))
        throw new Error(error || 'No pudimos enviar tus datos')
      }
      trackLead({ propertyId, eventId })
      setStatus('ok')
      setForm(INITIAL)
      // Cumplimos lo prometido: se abre la galería completa al instante y queda
      // desbloqueada en este navegador (no le volvemos a pedir los datos).
      setUnlocked(true)
      try {
        window.localStorage.setItem(unlockKey(propertyId), '1')
      } catch {
        /* sin localStorage el desbloqueo dura lo que la pestaña */
      }
    } catch (err) {
      setStatus('err')
      setErrorMsg(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      submittingRef.current = false
    }
  }

  return (
    <Ctx.Provider value={ctxValue}>
      {/* Con el popup abierto, el fondo queda `inert`: no se puede tabular ni
          leer con lector de pantalla → el foco se mantiene dentro del modal. */}
      <div inert={isOpen}>{children}</div>

      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lead-modal-title"
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Cerrar"
            onClick={close}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
          />
          {/* Panel */}
          <div className="relative z-10 w-full max-w-md rounded-t-2xl bg-white p-6 text-slate-900 shadow-2xl sm:rounded-2xl sm:p-8 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300">
            <button
              ref={closeBtnRef}
              type="button"
              aria-label="Cerrar"
              onClick={close}
              className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>

            {status === 'ok' ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-600" />
                {/* id estable → aria-labelledby del diálogo resuelve también acá. */}
                <h2 id="lead-modal-title" className="text-lg font-medium">
                  {source === GALLERY_LOCK_SOURCE ? '¡Listo! Ya podés verla completa' : '¡Gracias! Recibimos tus datos.'}
                </h2>
                <p className="text-sm text-slate-500">
                  {source === GALLERY_LOCK_SOURCE
                    ? 'Cerrá esta ventana y recorré todas las fotos. Un asesor te contacta para coordinar la visita.'
                    : 'Un asesor te va a contactar muy pronto.'}
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-2 rounded-full bg-slate-900 px-6 py-2.5 text-sm font-medium text-white"
                >
                  {source === GALLERY_LOCK_SOURCE ? 'Ver las fotos' : 'Cerrar'}
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                {/* Honeypot: campo invisible para humanos; si un bot lo llena, no enviamos. */}
                <input
                  type="text"
                  name="_company"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  value={honeypot}
                  onChange={e => setHoneypot(e.target.value)}
                  style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
                />
                <div>
                  <h2 id="lead-modal-title" className="text-2xl" style={{ fontFamily: 'var(--font-landing-serif), Georgia, serif' }}>
                    {source === GALLERY_LOCK_SOURCE ? 'Conocela por dentro' : 'Dejanos tus datos'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {source === GALLERY_LOCK_SOURCE
                      ? 'Dejanos tus datos y en un segundo ves todas las fotos de la propiedad.'
                      : 'Un asesor te contacta para lo que necesites — sin compromiso.'}
                  </p>
                </div>
                <input type="hidden" value={propertyTitle} readOnly />
                <div>
                  <label className="mb-1.5 block text-sm font-medium" htmlFor="lc-name">
                    Nombre y apellido <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={firstFieldRef}
                    id="lc-name"
                    type="text"
                    required
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-slate-900"
                    placeholder="Juan Pérez"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="lc-email">
                      Email
                    </label>
                    <input
                      id="lc-email"
                      type="email"
                      value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-slate-900"
                      placeholder="juan@ejemplo.com"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="lc-phone">
                      Teléfono / WhatsApp
                    </label>
                    <input
                      id="lc-phone"
                      type="tel"
                      value={form.phone}
                      onChange={e => setForm({ ...form, phone: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-slate-900"
                      placeholder="+54 11 XXXX XXXX"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium" htmlFor="lc-intent">
                    ¿Qué te interesa?
                  </label>
                  <select
                    id="lc-intent"
                    value={form.intent}
                    onChange={e => setForm({ ...form, intent: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-slate-900"
                  >
                    {INTENTS.map(i => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                </div>

                {status === 'err' && errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

                <button
                  type="submit"
                  disabled={status === 'sending'}
                  className="flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-base font-medium text-white transition hover:opacity-95 disabled:opacity-60"
                  style={{ background: 'var(--brand)' }}
                >
                  {status === 'sending' && <Loader2 className="h-4 w-4 animate-spin" />}
                  Me interesa, quiero que me contacten
                </button>
                <p className="text-center text-xs text-slate-400">
                  Al enviar aceptás nuestra{' '}
                  <a href="https://inmodf.com.ar/privacidad" className="underline">
                    política de privacidad
                  </a>
                  .
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}
