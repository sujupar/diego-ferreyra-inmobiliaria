/**
 * Helpers PUROS para el selector de país del teléfono de la landing
 * (`components/landing/PhoneField.tsx`). Separados del componente para poder
 * testearlos con Vitest sin necesitar DOM (el entorno local no levanta
 * happy-dom — ver CLAUDE.md).
 *
 * Nada acá importa `libphonenumber-js/max` de forma estática: quien construye
 * la lista de países (`buildCountryOptions`) recibe `getCountries`/
 * `getCountryCallingCode` ya resueltos por el caller (que los carga con
 * `import()` diferido — son ~50 KB gzip y esta landing es tráfico pago).
 */

export interface CountryOption {
  iso2: string
  code: string // indicativo SIN "+", ej. "54"
  name: string
}

/** Bandera como emoji: matemática de Unicode (regional indicators), sin ningún paquete de imágenes. */
export function flagEmoji(iso2: string): string {
  const cc = iso2.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(cc)) return '🏳️'
  return cc.replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)))
}

/** Arma la lista de países ordenada por nombre. Recibe los resolvers ya cargados (inyección de dependencia → testeable sin la librería real). */
export function buildCountryOptions(
  isoCodes: string[],
  callingCodeOf: (iso2: string) => string,
  nameOf: (iso2: string) => string,
): CountryOption[] {
  return isoCodes
    .map(iso2 => ({ iso2, code: callingCodeOf(iso2), name: nameOf(iso2) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

/** Filtro del buscador del dropdown: por nombre, ISO2 exacto, o indicativo. */
export function filterCountries(options: CountryOption[], rawQuery: string): CountryOption[] {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return options
  const qDigits = q.replace(/\D/g, '')
  return options.filter(
    o =>
      o.name.toLowerCase().includes(q) ||
      o.iso2.toLowerCase() === q ||
      (qDigits.length > 0 && o.code.startsWith(qDigits)),
  )
}

/**
 * Compone el valor final a mandar en el POST: si la persona pegó un número
 * internacional completo (empieza con "+"), se respeta tal cual — nunca se le
 * vuelve a anteponer el indicativo. Si no, se antepone el indicativo del país
 * elegido. Así lo que queda guardado en `property_leads.phone` SIEMPRE se
 * puede volver a normalizar más abajo en el sistema sin pasar una región
 * explícita (el webhook, el Inbox, el envío de WhatsApp y el CAPI llaman a
 * `normalizeWhatsappPhone`/`isWhatsappUsable` con un solo argumento).
 */
export function composePhoneForSubmit(localValue: string, callingCode: string): string {
  const trimmed = localValue.trim()
  if (!trimmed || trimmed.startsWith('+')) return trimmed
  return `+${callingCode} ${trimmed}`
}
