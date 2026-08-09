/**
 * Lógica PURA de la cola de avisos del embudo (sin Supabase, sin red).
 *
 * Vive aparte del worker a propósito: lo que decide qué se encola, en qué orden
 * se atiende y cuándo se reintenta es lo que hay que poder testear sin levantar
 * nada. El worker (`side-effects-worker.ts`) solo pone el I/O alrededor.
 */

/** Los cinco avisos que salen del camino crítico de `POST /api/funnel/submit`. */
export const TIPOS_DE_TRABAJO = [
  'coordinator_task',
  'notify',
  'mailchimp',
  'anon_stitch',
  'capi',
] as const

export type TipoDeTrabajo = (typeof TIPOS_DE_TRABAJO)[number]

/**
 * Orden en que se atienden dentro de una misma corrida.
 *
 * Primero lo que hace que una PERSONA se entere del lead (el email, después la
 * tarea en el CRM), después la conversión a Meta —que tolera demora: Meta acepta
 * eventos de hasta 7 días—, y al final lo accesorio. Si un tick no alcanza para
 * todos, lo que queda sin hacer es lo que menos duele.
 */
const PRIORIDAD: Record<TipoDeTrabajo, number> = {
  notify: 0,
  coordinator_task: 1,
  capi: 2,
  anon_stitch: 3,
  mailchimp: 4,
}

/**
 * Escalera de reintentos: 30 s, 2 min, 10 min, 1 h, 6 h. Arranca corto porque
 * del otro lado hay una persona esperando que le avisen de un lead pago, y se
 * estira para no castigar a un tercero que está caído.
 */
export const ESPERAS_SEGUNDOS = [30, 120, 600, 3600, 21600] as const

export interface TrabajoEncolable {
  kind: TipoDeTrabajo
  payload: Record<string, unknown>
}

export interface DatosDelEnvio {
  funnel: 'tasacion' | 'clase'
  contactId: string
  dealId: string
  nombre: string
  email: string | null
  phone: string | null
  propertyLocation: string | null
  /** Sesión anónima de la analítica de video → stitching. */
  anonId: string | null
  /** El MISMO id que usó el Píxel en el navegador (Meta dedupea con esto). */
  eventId: string | null
  eventSourceUrl: string
  /**
   * Momento REAL de la conversión, en segundos. Viaja en el payload porque el
   * evento se manda después: sin esto, Meta registraría la hora en que corrió el
   * worker y no la hora en que la persona se registró.
   */
  eventTimeUnixSeconds: number
  fbp: string | null
  fbc: string | null
  ip: string | null
  userAgent: string | null
}

/**
 * Arma los CINCO trabajos de un envío. Siempre los cinco, incluso cuando ya se
 * sabe que alguno no va a hacer nada (sin `anonId` no hay stitching, sin
 * `eventId` no hay evento de conversión): así el registro de un lead siempre
 * tiene cinco filas y se puede leer de un vistazo qué pasó con cada aviso. Los
 * que no aplican terminan en 'skipped', que es información, no ruido.
 */
export function construirTrabajos(d: DatosDelEnvio): TrabajoEncolable[] {
  const contentName = d.funnel === 'clase' ? 'Clase Gratuita' : 'Tasación Directa'
  return [
    {
      kind: 'coordinator_task',
      payload: {
        funnel: d.funnel,
        dealId: d.dealId,
        contactId: d.contactId,
        nombre: d.nombre,
      },
    },
    { kind: 'notify', payload: { funnel: d.funnel, dealId: d.dealId } },
    { kind: 'mailchimp', payload: { dealId: d.dealId } },
    { kind: 'anon_stitch', payload: { anonId: d.anonId, contactId: d.contactId } },
    {
      kind: 'capi',
      payload: {
        funnel: d.funnel,
        eventId: d.eventId,
        eventSourceUrl: d.eventSourceUrl,
        eventTimeUnixSeconds: d.eventTimeUnixSeconds,
        contentName,
        nombre: d.nombre,
        email: d.email,
        phone: d.phone,
        propertyLocation: d.propertyLocation,
        contactId: d.contactId,
        fbp: d.fbp,
        fbc: d.fbc,
        ip: d.ip,
        userAgent: d.userAgent,
      },
    },
  ]
}

/** Lo mínimo que el worker necesita saber de una fila para ordenarla. */
export interface TrabajoOrdenable {
  id: string
  kind: TipoDeTrabajo
  created_at: string
}

/**
 * Ordena el lote de una corrida: primero los envíos más viejos (nadie espera
 * más que el que llegó antes) y, dentro de un mismo envío, por prioridad.
 */
export function ordenarTrabajos<T extends TrabajoOrdenable>(trabajos: T[]): T[] {
  return [...trabajos].sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1
    const pa = PRIORIDAD[a.kind] ?? 99
    const pb = PRIORIDAD[b.kind] ?? 99
    if (pa !== pb) return pa - pb
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

export interface EstadoTrasFallo {
  status: 'pending' | 'failed'
  next_attempt_at: string | null
}

/**
 * Qué hacer con un trabajo que falló. `intentos` es el contador YA incrementado
 * (el worker lo sube al tomarlo, no al terminarlo: un trabajo que mata al worker
 * a mitad igual gasta intento y no queda dando vueltas para siempre).
 */
export function siguienteIntento(
  intentos: number,
  maxIntentos: number,
  ahoraMs: number = Date.now(),
): EstadoTrasFallo {
  if (intentos >= maxIntentos) {
    return { status: 'failed', next_attempt_at: null }
  }
  const idx = Math.min(Math.max(intentos - 1, 0), ESPERAS_SEGUNDOS.length - 1)
  const espera = ESPERAS_SEGUNDOS[idx]
  return {
    status: 'pending',
    next_attempt_at: new Date(ahoraMs + espera * 1000).toISOString(),
  }
}
