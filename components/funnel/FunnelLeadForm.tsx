'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { PhoneField } from '@/components/landing/PhoneField'
import { composePhoneForSubmit } from '@/lib/landing/phone-country'
import type { CountryCode } from 'libphonenumber-js/max'

/**
 * Formulario de captura de los embudos (tasación / clase).
 *
 * REESCRITO 2026-08-13 tras un caso real: una clienta escribió por Instagram
 * "no me permite pedir la tasación gratuita". Causas encontradas y corregidas:
 *
 *  1. `type="email"` SIN `noValidate` → el NAVEGADOR bloqueaba el envío con su
 *     propio globo ("Ingrese un correo electrónico válido") ANTES de que corriera
 *     nuestro código. Basta un espacio final (los teclados móviles lo agregan al
 *     autocompletar) para que Chrome lo rechace. La persona tocaba enviar y "no
 *     pasaba nada". Ahora: `noValidate` + input de texto con `inputMode="email"`
 *     + validación propia sobre el valor YA recortado.
 *  2. El teléfono se guardaba tal cual, sin indicativo de país → el WhatsApp
 *     nunca llegaba (mismo bug que ya había costado un cliente en las landings
 *     de propiedades). Ahora usa `PhoneField` + normalización a E.164, igual que
 *     el popup probado de propiedades.
 *  3. Sin guard contra doble envío → dos taps rápidos en mobile creaban dos leads.
 *  4. El honeypot usaba `className="hidden"`; algunos gestores de contraseñas lo
 *     autocompletaban y el envío se descartaba con un falso éxito. Ahora va fuera
 *     de pantalla, como en el popup de propiedades.
 *
 * Fricción (pedido del dueño): se elimina el campo "barrio/dirección" — se pide
 * después por WhatsApp, donde la conversación ya está abierta.
 */

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
  /** Botón verde de WhatsApp con logo (promete que el contacto llega por ahí). */
  whatsappCta?: boolean
  /** Aclaración bajo el botón (ej. "Te llega un WhatsApp para coordinar"). */
  footnote?: string
  onSubmit: (values: FunnelLeadValues) => Promise<void>
}

/** Logo oficial de WhatsApp (SVG inline, sin dependencias). */
function WhatsAppIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-white ${className}`}
    >
      <svg viewBox="0 0 448 512" className="h-[65%] w-[65%]" fill="#25D366">
        <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
      </svg>
    </span>
  )
}

/** Igual que en el popup de propiedades: 50 KB de metadata solo si hace falta. */
async function loadPhoneCheck(): Promise<(v: string, region?: CountryCode) => boolean> {
  const { isWhatsappUsable } = await import('@/lib/integrations/whatsapp/phone')
  return isWhatsappUsable
}
async function loadPhoneNormalizer(): Promise<(v: string, region?: CountryCode) => string | null> {
  const { normalizeWhatsappPhone } = await import('@/lib/integrations/whatsapp/phone')
  return normalizeWhatsappPhone
}
async function loadCallingCode(iso2: string): Promise<string | null> {
  try {
    const { getCountryCallingCode } = await import('libphonenumber-js/max')
    return getCountryCallingCode(iso2 as CountryCode)
  } catch {
    return null
  }
}

/** Validación de email propia (la nativa del navegador nos bloqueaba envíos). */
function emailValido(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v)
}

export function FunnelLeadForm({
  variant,
  submitLabel,
  tipoClienteLabel,
  tipoClienteOptions,
  whatsappCta = false,
  footnote,
  onSubmit,
}: FunnelLeadFormProps) {
  const [values, setValues] = useState<FunnelLeadValues>({ name: '', phone: '', email: '', company: '' })
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [country, setCountry] = useState('AR')
  const [callingCode, setCallingCode] = useState('54')
  // Guard sincrónico contra doble envío (el state es async: dos taps rápidos en
  // mobile creaban dos leads y dos WhatsApp a la misma persona).
  const submittingRef = useRef(false)
  const geoFetchedRef = useRef(false)

  function set<K extends keyof FunnelLeadValues>(k: K, v: FunnelLeadValues[K]) {
    setValues((p) => ({ ...p, [k]: v }))
  }

  // País por defecto según geo (Netlify manda el header). Nunca bloquea: si
  // falla, sigue en AR.
  useEffect(() => {
    if (geoFetchedRef.current) return
    geoFetchedRef.current = true
    fetch('/api/geo')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { country?: string } | null) => {
        if (d?.country && typeof d.country === 'string') setCountry(d.country)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    let cancelado = false
    loadCallingCode(country).then((c) => {
      if (!cancelado && c) setCallingCode(c)
    })
    return () => {
      cancelado = true
    }
  }, [country])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submittingRef.current) return
    setError(null)

    // Honeypot: si un bot lo llenó, fingimos éxito sin enviar nada.
    if ((values.company ?? '').trim()) {
      setDone(true)
      return
    }

    // Se valida SIEMPRE sobre el valor recortado (los teclados móviles agregan
    // espacios al autocompletar y eso rompía el envío).
    const name = values.name.trim()
    const email = values.email.trim().toLowerCase()
    const phoneRaw = values.phone.trim()

    if (name.length < 2) return setError('Escribí tu nombre para continuar.')
    if (!phoneRaw) return setError('Necesitamos tu WhatsApp para coordinar la tasación.')
    if (!emailValido(email)) return setError('Revisá el email: parece que le falta algo (ej. nombre@gmail.com).')

    submittingRef.current = true
    setSubmitting(true)

    // Teléfono utilizable por WhatsApp + guardado en E.164. Sin esto se repite el
    // bug que ya costó un cliente: un celular sin indicativo se guardaba tal cual
    // y el mensaje nunca llegaba.
    let phoneParaGuardar = composePhoneForSubmit(phoneRaw, callingCode)
    let usable = true
    try {
      usable = (await loadPhoneCheck())(phoneRaw, country as CountryCode)
      if (usable) {
        const e164 = (await loadPhoneNormalizer())(phoneRaw, country as CountryCode)
        if (e164) phoneParaGuardar = `+${e164}`
      }
    } catch {
      usable = true // si el chunk no carga, NO bloqueamos: un lead vale más que la validación
    }
    if (!usable) {
      submittingRef.current = false
      setSubmitting(false)
      return setError('Revisá el número: puede faltarle la característica (ej. 11 para CABA).')
    }

    try {
      await onSubmit({ ...values, name, email, phone: phoneParaGuardar })
      setDone(true)
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'No pudimos enviar tus datos. Revisá tu conexión y probá de nuevo.',
      )
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <p role="status" className="py-6 text-center text-[#0d2d49]">
        ¡Listo! Recibimos tus datos. Te escribimos por WhatsApp en unos minutos. ✅
      </p>
    )
  }

  return (
    // `noValidate`: la validación nativa del navegador bloqueaba envíos legítimos
    // con su propio mensaje. La nuestra corre siempre y explica qué corregir.
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      <input
        aria-label="Nombre"
        placeholder="Tu nombre..."
        autoComplete="name"
        value={values.name}
        onChange={(e) => set('name', e.target.value)}
        className="rounded-lg border border-[#DEE2E6] px-4 py-3"
      />
      <PhoneField
        id="funnel-phone"
        value={values.phone}
        onChange={(v) => set('phone', v)}
        country={country}
        onCountryChange={setCountry}
      />
      <input
        aria-label="Email"
        // OJO: NO usar type="email" — su validación nativa bloqueaba el envío.
        type="text"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Tu mejor email..."
        value={values.email}
        onChange={(e) => set('email', e.target.value)}
        className="rounded-lg border border-[#DEE2E6] px-4 py-3"
      />
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
      {/* Honeypot: FUERA DE PANTALLA (no `hidden`, que los gestores de
          contraseñas autocompletan y descartaban envíos reales). */}
      <input
        type="text"
        name="_company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={values.company ?? ''}
        onChange={(e) => set('company', e.target.value)}
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
      />
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className={`mt-1 flex items-center justify-center gap-2.5 rounded-lg px-6 py-3.5 text-base font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-60 ${
          whatsappCta ? '' : 'bg-[#00BF63]'
        }`}
        style={whatsappCta ? { background: '#25D366' } : undefined}
      >
        {submitting ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : whatsappCta ? (
          <WhatsAppIcon />
        ) : null}
        {submitting ? 'Enviando...' : submitLabel}
      </button>
      {footnote && <p className="text-center text-xs text-[#777]">{footnote}</p>}
    </form>
  )
}
