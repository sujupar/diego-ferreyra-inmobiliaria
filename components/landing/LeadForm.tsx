'use client'

import { useState } from 'react'
import { Loader2, CheckCircle2 } from 'lucide-react'

interface LeadFormProps {
  propertyId: string
  propertyTitle: string
}

interface FormState {
  name: string
  email: string
  phone: string
  message: string
}

const INITIAL: FormState = { name: '', email: '', phone: '', message: '' }

function getUtmFromUrl(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const params = new URLSearchParams(window.location.search)
  const utm: Record<string, string> = {}
  for (const [k, v] of params.entries()) {
    if (k.startsWith('utm_') || k === 'fbclid' || k === 'gclid') utm[k] = v
  }
  return utm
}

export function LandingLeadForm({ propertyId, propertyTitle }: LeadFormProps) {
  const [form, setForm] = useState<FormState>(INITIAL)
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle')
  const [errorMsg, setErrorMsg] = useState<string>('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || (!form.email.trim() && !form.phone.trim())) {
      setStatus('err')
      setErrorMsg('Necesitamos tu nombre y al menos un contacto (email o teléfono).')
      return
    }
    setStatus('sending')
    setErrorMsg('')
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          name: form.name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          message: form.message.trim() || null,
          utm: getUtmFromUrl(),
        }),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Error' }))
        throw new Error(error || 'No pudimos enviar el formulario')
      }
      setStatus('ok')
      setForm(INITIAL)
    } catch (err) {
      setStatus('err')
      setErrorMsg(err instanceof Error ? err.message : 'Error desconocido')
    }
  }

  return (
    <section
      id="contacto"
      className="py-12 md:py-20 px-6 md:px-12 lg:px-20 max-w-3xl mx-auto"
    >
      <div className="rounded-2xl border bg-card p-6 md:p-10">
        <h2 className="text-2xl md:text-3xl font-medium">¿Te interesa esta propiedad?</h2>
        <p className="text-muted-foreground mt-2">
          Dejanos tus datos y un asesor se contacta a la brevedad para coordinar una visita o
          responder tus consultas.
        </p>

        {status === 'ok' ? (
          <div className="mt-8 flex flex-col items-center text-center gap-3 py-8">
            <CheckCircle2 className="h-12 w-12 text-emerald-600" />
            <p className="text-lg font-medium">¡Gracias, recibimos tu consulta!</p>
            <p className="text-sm text-muted-foreground">
              Un asesor te va a contactar muy pronto.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-4">
            <input type="hidden" value={propertyTitle} readOnly />
            <div>
              <label className="block text-sm font-medium mb-1.5" htmlFor="lead-name">
                Nombre y apellido <span className="text-[color:var(--destructive)]">*</span>
              </label>
              <input
                id="lead-name"
                type="text"
                required
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-base"
                placeholder="Juan Pérez"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" htmlFor="lead-email">
                  Email
                </label>
                <input
                  id="lead-email"
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-base"
                  placeholder="juan@ejemplo.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" htmlFor="lead-phone">
                  Teléfono / WhatsApp
                </label>
                <input
                  id="lead-phone"
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-base"
                  placeholder="+54 11 XXXX XXXX"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" htmlFor="lead-message">
                Mensaje (opcional)
              </label>
              <textarea
                id="lead-message"
                rows={4}
                value={form.message}
                onChange={e => setForm({ ...form, message: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-base"
                placeholder="Quisiera coordinar una visita..."
              />
            </div>

            {status === 'err' && errorMsg && (
              <p className="text-sm text-[color:var(--destructive)]">{errorMsg}</p>
            )}

            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[color:var(--brand)] px-6 py-3 text-base font-medium text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {status === 'sending' && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar consulta
            </button>
            <p className="text-xs text-muted-foreground text-center">
              Al enviar aceptás nuestra{' '}
              <a href="https://inmodf.com.ar/privacidad" className="underline">
                política de privacidad
              </a>
              .
            </p>
          </form>
        )}
      </div>
    </section>
  )
}
