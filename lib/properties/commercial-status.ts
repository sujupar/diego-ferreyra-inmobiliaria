/**
 * Estado comercial de una propiedad — catálogo y reglas.
 *
 * Eje INDEPENDIENTE de `properties.status` (que describe la captación).
 * Ver docs/superpowers/specs/2026-08-06-estado-comercial-propiedad-design.md
 *
 * OJO: agregar un estado acá obliga a actualizar TAMBIÉN el CHECK de
 * `properties_commercial_status_check` en la base, o la app escribe un valor
 * que Postgres rechaza con 23514.
 */

export type CommercialStatus =
  | 'disponible' | 'reservada' | 'vendida' | 'dada_de_baja' | 'descartada'

export interface CommercialStatusDef {
  key: CommercialStatus
  label: string
  /** Qué significa. Se muestra en la tarjeta: si el equipo no lo entiende igual, el dato no sirve. */
  description: string
  /** Clases del badge. */
  badge: string
  /** Clase del punto de color. */
  dot: string
}

export const COMMERCIAL_STATUSES: CommercialStatusDef[] = [
  {
    key: 'disponible', label: 'Disponible',
    description: 'En comercialización activa. Se difunde y se muestra a interesados.',
    badge: 'bg-emerald-600 text-white', dot: 'bg-emerald-500',
  },
  {
    key: 'reservada', label: 'Reservada',
    description: 'Hay seña o reserva. No se ofrece a nuevos interesados, pero puede volver a Disponible.',
    badge: 'bg-amber-500 text-white', dot: 'bg-amber-500',
  },
  {
    key: 'vendida', label: 'Vendida',
    description: 'Operación cerrada. Registra el precio real y la fecha de la operación.',
    badge: 'bg-[color:var(--brand)] text-white', dot: 'bg-[color:var(--brand)]',
  },
  {
    key: 'dada_de_baja', label: 'Dada de baja',
    description: 'El propietario la retiró o venció la exclusividad. Dejamos de comercializarla sin haberla vendido.',
    badge: 'bg-slate-600 text-white', dot: 'bg-slate-500',
  },
  {
    key: 'descartada', label: 'Descartada',
    description: 'No se llegó a trabajar o se decidió no seguirla. Queda guardada, fuera del flujo activo.',
    badge: 'bg-slate-500 text-white', dot: 'bg-slate-400',
  },
]

const BY_KEY = new Map(COMMERCIAL_STATUSES.map(s => [s.key, s]))

export function isCommercialStatus(v: unknown): v is CommercialStatus {
  return typeof v === 'string' && BY_KEY.has(v as CommercialStatus)
}

/** Definición del estado. Un valor desconocido cae en `disponible`: la ficha nunca queda en blanco. */
export function commercialStatusDef(key: string | null | undefined): CommercialStatusDef {
  return BY_KEY.get((key ?? '') as CommercialStatus) ?? COMMERCIAL_STATUSES[0]
}

/**
 * Estado comercial REAL de una propiedad, contemplando el espejo heredado.
 *
 * `commercial_status` es la fuente de verdad, pero NO es la única puerta:
 * el descarte masivo del listado manda `PUT {status:'descartada'}` por la ruta
 * genérica y no toca esta columna (que es NOT NULL DEFAULT 'disponible'). Sin
 * esta derivación, una propiedad descartada en masa se lee como 'disponible' y
 * pasan dos cosas a la vez:
 *
 *  - la tarjeta de la ficha ofrece solo los OTROS estados, o sea que "Disponible"
 *    —el botón para recuperarla— no aparece, contradiciendo al badge que dice
 *    "Descartada";
 *  - y el servidor, que re-deriva el estado de origen, nunca entra en la rama
 *    `from === 'descartada'` de `buildStatusPatch`, así que apretar cualquier
 *    otro botón deja `status='descartada'` intacto en la base: la propiedad
 *    queda con dos estados contradictorios.
 *
 * Se usa en las DOS puntas (tarjeta y ruta) a propósito: si solo se arregla la
 * pantalla, el botón aparece y no hace nada.
 */
export function estadoComercialEfectivo(i: {
  commercialStatus: string | null | undefined
  status: string | null | undefined
}): CommercialStatus {
  if (isCommercialStatus(i.commercialStatus) && i.commercialStatus !== 'disponible') return i.commercialStatus
  if (i.status === 'descartada') return 'descartada'
  return isCommercialStatus(i.commercialStatus) ? i.commercialStatus : 'disponible'
}

export interface StatusChangeInput {
  from: CommercialStatus
  to: CommercialStatus
  reason?: string | null
  soldPrice?: number | null
  soldCurrency?: string | null
  /** 'YYYY-MM-DD' */
  soldAt?: string | null
  /** 'YYYY-MM-DD'. Inyectable para que los tests no dependan del reloj. */
  today?: string
}

export interface ValidationResult { ok: boolean; error?: string }

function hoy(): string {
  return new Date().toISOString().slice(0, 10)
}

export function validateStatusChange(i: StatusChangeInput): ValidationResult {
  if (i.from === i.to) {
    return { ok: false, error: `La propiedad ya está en estado "${commercialStatusDef(i.to).label}".` }
  }

  if (i.to === 'vendida') {
    if (i.soldPrice == null || !Number.isFinite(i.soldPrice) || i.soldPrice <= 0) {
      return { ok: false, error: 'Para marcarla como vendida necesitás cargar el precio real de la operación.' }
    }
    if (!i.soldCurrency) {
      return { ok: false, error: 'Elegí la moneda de la operación.' }
    }
    if (!i.soldAt) {
      return { ok: false, error: 'Para marcarla como vendida necesitás cargar la fecha de la operación.' }
    }
    // Las fechas 'YYYY-MM-DD' se comparan bien como texto.
    if (i.soldAt > (i.today ?? hoy())) {
      return { ok: false, error: 'La fecha de la operación no puede estar en el futuro.' }
    }
  }

  // Anular una venta registrada tiene que quedar explicado.
  if (i.from === 'vendida' && !i.reason?.trim()) {
    return { ok: false, error: 'Para sacarla del estado vendida necesitás escribir el motivo.' }
  }

  return { ok: true }
}

export interface StatusChangePatch {
  commercial_status: CommercialStatus
  sold_price: number | null
  sold_currency: string | null
  sold_at: string | null
  /** Espejo heredado: solo se setea cuando entra o sale de `descartada`. */
  status?: string
}

/**
 * Campos a escribir en `properties`. Asume que `validateStatusChange` pasó.
 *
 * El espejo en `status` existe porque cinco lugares del sistema todavía leen
 * `status === 'descartada'` (badge del listado, descarte masivo, isDiscarded,
 * nextStep y la vista vw_properties_list). Ver spec §6.
 */
export function buildStatusPatch(i: StatusChangeInput): StatusChangePatch {
  const esVenta = i.to === 'vendida'
  const patch: StatusChangePatch = {
    commercial_status: i.to,
    sold_price: esVenta ? (i.soldPrice ?? null) : null,
    sold_currency: esVenta ? (i.soldCurrency ?? null) : null,
    sold_at: esVenta ? (i.soldAt ?? null) : null,
  }
  if (i.to === 'descartada') patch.status = 'descartada'
  else if (i.from === 'descartada') patch.status = 'draft'
  return patch
}
