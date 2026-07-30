'use client'

/**
 * Task 5 — Campo de teléfono con bandera + indicativo automático.
 *
 * Antes la persona tenía que escribir el indicativo de país A MANO (si no,
 * el WhatsApp no llegaba — ver `lib/integrations/whatsapp/phone.ts`). Este
 * campo separa el indicativo (bandera, elegible, con default automático por
 * geolocalización) del número local: la persona solo escribe su número.
 *
 * Este componente SOLO se monta dentro del popup de `LeadCaptureProvider`,
 * que recién renderiza su contenido cuando `isOpen` pasa a `true` (un click
 * del visitante). Como en el SSR y en la primera hidratación el popup está
 * SIEMPRE cerrado (mismo estado en server y cliente), este componente nunca
 * se renderiza en esa primera pasada — no hay riesgo de mismatch de
 * hidratación acá, y por eso puede tener estado propio (dropdown abierto,
 * lista de países cargando) sin romper la regla dura de la landing.
 *
 * `libphonenumber-js/max` (~50 KB gzip, la fuente de `getCountries` +
 * `getCountryCallingCode`) se carga con `import()` DIFERIDO recién al montar
 * este campo (o sea: al abrir el popup) — igual que `loadPhoneCheck` en
 * `LeadCaptureProvider`. Nunca entra en el bundle inicial de la landing.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  flagEmoji,
  buildCountryOptions,
  filterCountries,
  type CountryOption,
} from '@/lib/landing/phone-country'
import type { CountryCode } from 'libphonenumber-js/max'

/** Único país que se conoce ANTES de cargar la librería completa (fallback mientras carga o si falla). */
const FALLBACK: CountryOption = { iso2: 'AR', code: '54', name: 'Argentina' }

async function loadCountryOptions(): Promise<CountryOption[]> {
  const { getCountries, getCountryCallingCode } = await import('libphonenumber-js/max')
  const nombres =
    typeof Intl !== 'undefined' && 'DisplayNames' in Intl
      ? new Intl.DisplayNames(['es'], { type: 'region' })
      : null
  return buildCountryOptions(
    getCountries(),
    iso2 => getCountryCallingCode(iso2 as CountryCode),
    iso2 => {
      try {
        return nombres?.of(iso2) ?? iso2
      } catch {
        return iso2
      }
    },
  )
}

export interface PhoneFieldProps {
  id: string
  /** Solo el número local, SIN indicativo — el indicativo lo maneja este campo. */
  value: string
  onChange: (value: string) => void
  /** ISO2 del país elegido (ej. "AR"). */
  country: string
  onCountryChange: (iso2: string) => void
  placeholder?: string
}

export function PhoneField({
  id,
  value,
  onChange,
  country,
  onCountryChange,
  placeholder = '11 XXXX XXXX',
}: PhoneFieldProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<CountryOption[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Carga la lista completa apenas se monta el campo (= apenas se abre el
  // popup). No bloquea nada: mientras tanto se muestra el fallback AR.
  useEffect(() => {
    let cancelado = false
    loadCountryOptions()
      .then(list => {
        if (!cancelado) setOptions(list)
      })
      .catch(() => {
        if (!cancelado) setLoadFailed(true)
      })
    return () => {
      cancelado = true
    }
  }, [])

  const current = useMemo<CountryOption>(() => {
    const found = options?.find(o => o.iso2 === country)
    if (found) return found
    return country === 'AR' ? FALLBACK : { iso2: country, code: '', name: country }
  }, [options, country])

  const filtered = useMemo(() => filterCountries(options ?? [], query), [options, query])

  // Cerrar al hacer click afuera.
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 10)
  }, [open])

  function pick(iso2: string) {
    onCountryChange(iso2)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-slate-900">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Elegir país / indicativo"
          className="flex shrink-0 items-center gap-0.5 border-r border-slate-300 pl-2 pr-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          {/* Ancho fijo + overflow-hidden: en algunos sistemas (ej. Windows sin
              fuente de emoji de bandera) el par de "regional indicators" se
              renderiza como 2 glifos separados en vez de 1 bandera combinada,
              casi duplicando el ancho. El cap evita que eso empuje el input. */}
          <span aria-hidden="true" className="inline-block w-[16px] shrink-0 overflow-hidden text-center leading-none">
            {flagEmoji(current.iso2)}
          </span>
          <span className="shrink-0 text-slate-600">
            {current.code ? `+${current.code}` : '···'}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
        </button>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="min-w-0 flex-1 px-3 py-2.5 text-base outline-none"
          placeholder={placeholder}
        />
      </div>

      {open && (
        <div
          role="listbox"
          aria-label="Países"
          className="absolute left-0 top-[calc(100%+4px)] z-20 max-h-64 w-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.stopPropagation() // solo cierra el dropdown, no todo el popup
                setOpen(false)
              }
            }}
            placeholder="Buscar país o indicativo..."
            className="w-full border-b border-slate-200 px-3 py-2 text-sm outline-none"
          />
          <ul className="max-h-52 overflow-y-auto py-1">
            {options === null && !loadFailed && (
              <li className="px-3 py-2 text-sm text-slate-400">Cargando países…</li>
            )}
            {loadFailed && (
              <li className="px-3 py-2 text-sm text-slate-400">
                No pudimos cargar la lista. Escribí tu número completo con el indicativo (ej. +54 11...).
              </li>
            )}
            {options !== null && filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-400">Sin resultados</li>
            )}
            {filtered.map(o => (
              <li key={o.iso2}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.iso2 === country}
                  onClick={() => pick(o.iso2)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span aria-hidden="true">{flagEmoji(o.iso2)}</span>
                  <span className="flex-1 truncate">{o.name}</span>
                  <span className="text-slate-400">+{o.code}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
