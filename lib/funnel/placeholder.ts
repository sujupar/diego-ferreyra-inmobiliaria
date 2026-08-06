/**
 * Placeholder de `deals.property_address` que arma `createFunnelLead` cuando el
 * lead NO dejó una ubicación real (`property_address` es NOT NULL, así que hace
 * falta algo para guardar). Formato: `"{label} — {nombre}"`.
 *
 * Vive en un módulo propio, separado de `create-funnel-lead.ts` (que carga
 * `notifyAppraisalRequest`/`notifyClassRegistration`/Supabase), a propósito:
 * `lib/email/notifications/appraisal-request.ts` necesita detectar este
 * placeholder para NO mostrarlo como si fuera una dirección real, y si
 * importara el label desde `create-funnel-lead.ts` se armaría un ciclo
 * (`appraisal-request.ts` → `create-funnel-lead.ts` → `appraisal-request.ts`,
 * porque `createFunnelLead` es quien llama a `notifyAppraisalRequest`).
 * `create-funnel-lead.ts` importa los labels DESDE ACÁ (no al revés), así que
 * los dos lados quedan atados a la misma constante sin ciclo.
 */

/** Separador literal entre el label y el nombre del lead. */
const PLACEHOLDER_SEPARATOR = ' — '

/** Un label de placeholder por tipo de funnel (mismos valores que usaba `resolveFunnelMapping`). */
export const FUNNEL_PLACEHOLDER_LABEL = {
  tasacion: 'Solicitud de tasación',
  clase: 'Clase Gratuita',
} as const satisfies Record<'tasacion' | 'clase', string>

/** Arma el placeholder tal como lo persiste `createFunnelLead`. */
export function buildPlaceholderAddress(funnel: keyof typeof FUNNEL_PLACEHOLDER_LABEL, name: string): string {
  return `${FUNNEL_PLACEHOLDER_LABEL[funnel]}${PLACEHOLDER_SEPARATOR}${name}`
}

/**
 * ¿`address` es uno de los placeholders generados (no una dirección real que el
 * interesado haya dejado)? Puro — sin I/O.
 */
export function isPlaceholderAddress(address: string | null | undefined): boolean {
  if (!address) return false
  return Object.values(FUNNEL_PLACEHOLDER_LABEL).some((label) =>
    address.startsWith(`${label}${PLACEHOLDER_SEPARATOR}`),
  )
}
