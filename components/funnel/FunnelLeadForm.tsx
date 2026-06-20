'use client'

import { useState } from 'react'

export interface FunnelLeadValues {
  name: string
  phone: string
  email: string
  propertyLocation?: string
  tipoCliente?: string
  /** honeypot — debe quedar vacío */
  company?: string
}

interface FunnelLeadFormProps {
  variant: 'tasacion' | 'clase'
  submitLabel: string
  tipoClienteLabel?: string
  tipoClienteOptions?: readonly string[]
  onSubmit: (values: FunnelLeadValues) => Promise<void>
}

export function FunnelLeadForm({
  variant,
  submitLabel,
  tipoClienteLabel,
  tipoClienteOptions,
  onSubmit,
}: FunnelLeadFormProps) {
  const [values, setValues] = useState<FunnelLeadValues>({ name: '', phone: '', email: '', company: '' })
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  function set<K extends keyof FunnelLeadValues>(k: K, v: FunnelLeadValues[K]) {
    setValues((p) => ({ ...p, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (values.name.trim().length < 2) return setError('Ingresá tu nombre.')
    if (values.phone.trim().length < 6) return setError('Ingresá un teléfono válido.')
    if (!/.+@.+\..+/.test(values.email)) return setError('Ingresá un email válido.')
    setSubmitting(true)
    try {
      await onSubmit(values)
      setDone(true)
    } catch {
      setError('Hubo un problema. Probá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <p role="status" className="py-6 text-center text-[#0d2d49]">
        ¡Listo! Recibimos tus datos. Te contactamos a la brevedad. ✅
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        aria-label="Nombre"
        placeholder="Tu nombre..."
        value={values.name}
        onChange={(e) => set('name', e.target.value)}
        data-clarity-mask="true"
        className="rounded-lg border border-[#DEE2E6] px-4 py-3"
      />
      <input
        aria-label="Teléfono"
        type="tel"
        placeholder="Tu número de teléfono..."
        value={values.phone}
        onChange={(e) => set('phone', e.target.value)}
        data-clarity-mask="true"
        className="rounded-lg border border-[#DEE2E6] px-4 py-3"
      />
      <input
        aria-label="Email"
        type="email"
        placeholder="Tu mejor email..."
        value={values.email}
        onChange={(e) => set('email', e.target.value)}
        data-clarity-mask="true"
        className="rounded-lg border border-[#DEE2E6] px-4 py-3"
      />
      {variant === 'tasacion' && (
        <input
          aria-label="Ubicación de la propiedad"
          placeholder="Barrio o dirección de tu propiedad..."
          value={values.propertyLocation ?? ''}
          onChange={(e) => set('propertyLocation', e.target.value)}
          data-clarity-mask="true"
          className="rounded-lg border border-[#DEE2E6] px-4 py-3"
        />
      )}
      {variant === 'clase' && tipoClienteOptions && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-[#0d2d49]">{tipoClienteLabel}</legend>
          {tipoClienteOptions.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="tipoCliente"
                value={opt}
                checked={values.tipoCliente === opt}
                onChange={(e) => set('tipoCliente', e.target.value)}
              />
              {opt}
            </label>
          ))}
        </fieldset>
      )}
      {/* honeypot anti-spam (Fase 2 lo valida) */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        value={values.company ?? ''}
        onChange={(e) => set('company', e.target.value)}
        className="hidden"
        aria-hidden="true"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="mt-1 rounded-lg bg-[#00BF63] px-6 py-3.5 text-base font-bold text-white shadow-lg transition hover:brightness-95 disabled:opacity-60"
      >
        {submitting ? 'Enviando...' : submitLabel}
      </button>
    </form>
  )
}
