// Reglas de las actividades de la ficha: validación del cuerpo, hora, número de intento,
// títulos y permisos (design.md D2 y D4). Puro: recibe `ahora` por parámetro.
import { z } from 'zod'
import { alcanceContactos } from '@/lib/auth/contact-access'
import { instanteDesdeAR } from './horario-laboral'
import { RESULTADOS_LLAMADA, type Actividad, type Intento, type ResultadoLlamada, type UsuarioMinimo } from './tipos'

export const MAX_MINUTOS_ATRAS = 7 * 24 * 60
export const MAX_LARGO_TEXTO = 2000

const MSG_LARGO = `El texto no puede pasar de ${MAX_LARGO_TEXTO} caracteres.`
const MSG_NOTA_VACIA = 'Escribí algo para guardar la nota' // texto de la spec crm-registro-actividad

// NFC antes de contar: una "é" pegada desde macOS llega como dos caracteres (NFD) y
// sin normalizar contaría doble y no coincidiría al buscar.
const normalizar = (s: string) => s.normalize('NFC').trim()

const textoObligatorio = z
  .string({ error: MSG_NOTA_VACIA })
  .transform(normalizar)
  .pipe(z.string().min(1, { error: MSG_NOTA_VACIA }).max(MAX_LARGO_TEXTO, { error: MSG_LARGO }))

// Opcional: vacío o solo espacios cuenta como "sin comentario".
const textoOpcional = z
  .string({ error: 'El comentario tiene que ser texto.' })
  .transform(normalizar)
  .pipe(z.string().max(MAX_LARGO_TEXTO, { error: MSG_LARGO }))
  .transform((s) => (s === '' ? undefined : s))
  .optional()

const minutos = z
  .number({ error: 'Los minutos tienen que ser un número.' })
  .int({ error: 'Los minutos tienen que ser un número entero.' })
  .min(0, { error: 'La hora no puede ser futura.' })
  .max(MAX_MINUTOS_ATRAS, { error: 'La llamada no puede ser de hace más de siete días.' })

const fechaISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'La fecha tiene que ser AAAA-MM-DD.' })
const horaHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'La hora tiene que ser HH:MM.' })
const token = z.uuid({ error: 'Falta el identificador del guardado.' })

export type NuevaActividad =
  | { kind: 'note'; body: string; client_token: string }
  | {
      kind: 'call'
      call_outcome: ResultadoLlamada
      body?: string
      hace_minutos?: number
      volver_el?: { fecha: string; hora: string }
      client_token: string
    }
  | { kind: 'whatsapp_sent'; body?: string; hace_minutos?: number; client_token: string }

export type CambioActividad = { accion: 'editar'; body: string } | { accion: 'anular' }

// Las claves desconocidas se descartan (comportamiento por defecto de z.object): así una
// fecha suelta, `automatic` o `created_by` mandados por la red no llegan al insert.
export const esquemaNuevaActividad: z.ZodType<NuevaActividad> = z.discriminatedUnion(
  'kind',
  [
    z.object({ kind: z.literal('note'), body: textoObligatorio, client_token: token }),
    z.object({
      kind: z.literal('call'),
      call_outcome: z.enum(RESULTADOS_LLAMADA, { error: 'Elegí el resultado de la llamada.' }),
      body: textoOpcional,
      hace_minutos: minutos.optional(),
      volver_el: z.object({ fecha: fechaISO, hora: horaHHMM }).optional(),
      client_token: token,
    }),
    z.object({
      kind: z.literal('whatsapp_sent'),
      body: textoOpcional,
      hace_minutos: minutos.optional(),
      client_token: token,
    }),
  ],
  { error: 'Tipo de registro desconocido.' },
)

export const esquemaCambioActividad: z.ZodType<CambioActividad> = z.discriminatedUnion(
  'accion',
  [
    z.object({ accion: z.literal('editar'), body: textoObligatorio }),
    z.object({ accion: z.literal('anular') }),
  ],
  { error: 'Acción desconocida.' },
)

/**
 * `null` = no mandar `occurred_at`: la base pone `occurred_at` y `created_at` con el
 * mismo `now()` y "por defecto es ahora" se cumple exacto, sin depender de dos relojes.
 */
export function resolverOcurrio(ahora: Date, haceMinutos?: number): Date | null {
  if (!haceMinutos) return null
  return new Date(ahora.getTime() - haceMinutos * 60_000)
}

export function validarVolverEl(
  volverEl: { fecha: string; hora: string } | undefined,
  ahora: Date,
): { ok: true } | { ok: false; error: string } {
  if (!volverEl) return { ok: false, error: 'Elegí el día y la hora para volver a llamar.' }
  let instante: Date
  try {
    instante = instanteDesdeAR(volverEl.fecha, volverEl.hora)
  } catch {
    // El motivo exacto (formato o fecha inexistente) no le sirve a quien carga: se le
    // pide elegir otra vez. No es un catch vacío: el resultado es un error visible.
    return { ok: false, error: 'El día o la hora para volver a llamar no son válidos.' }
  }
  if (instante.getTime() <= ahora.getTime()) {
    return { ok: false, error: 'El día y la hora para volver a llamar tienen que ser futuros.' }
  }
  return { ok: true }
}

/** Orden de los intentos: por `occurred_at` y, ante empate, por `created_at`. */
function compararIntentos(a: Intento, b: Intento): number {
  const dif = Date.parse(a.occurred_at) - Date.parse(b.occurred_at)
  if (dif !== 0) return dif
  return Date.parse(a.created_at) - Date.parse(b.created_at)
}

const SIN_PROCESO = '\u0000sin-proceso'
const claveProceso = (dealId: string | null) => dealId ?? SIN_PROCESO
const esIntento = (i: Intento) => i.kind === 'call' || i.kind === 'whatsapp_sent'

/**
 * Número de cada llamada dentro de su proceso (las sin proceso, entre sí). Recibe solo
 * actividades no anuladas: una anulada no ocupa número. El WhatsApp no ocupa número.
 */
export function numerarLlamadas(intentos: Intento[]): Map<string, number> {
  const porProceso = new Map<string, Intento[]>()
  for (const i of intentos) {
    if (i.kind !== 'call') continue
    const k = claveProceso(i.deal_id)
    porProceso.set(k, [...(porProceso.get(k) ?? []), i])
  }
  const numeros = new Map<string, number>()
  for (const lista of porProceso.values()) {
    lista.sort(compararIntentos).forEach((i, n) => numeros.set(i.id, n + 1))
  }
  return numeros
}

// Texto corto del resultado (maqueta `base.js`, campo `corto`): la spec fija
// "Llamada 1 · Agendó" como título en la actividad.
const RESULTADO_CORTO: Record<ResultadoLlamada, string> = {
  no_atendio: 'No atendió',
  agendo: 'Agendó',
  volver_a_llamar: 'Volver a llamar',
  no_interesa: 'No le interesa',
  numero_equivocado: 'Número equivocado',
}

export function tituloActividad(a: Pick<Actividad, 'kind' | 'call_outcome'>, intento: number | null): string {
  if (a.kind === 'note') return 'Nota'
  if (a.kind === 'whatsapp_sent') return 'WhatsApp enviado'
  const llamada = intento === null ? 'Llamada' : `Llamada ${intento}`
  return a.call_outcome ? `${llamada} · ${RESULTADO_CORTO[a.call_outcome]}` : llamada
}

/** Solo el autor edita su nota; la nota automática no la edita nadie. */
export function puedeEditarNota(a: Actividad, u: UsuarioMinimo): boolean {
  if (alcanceContactos(u.role) === 'ninguno') return false
  if (a.kind !== 'note' || a.automatic || a.voided_at) return false
  return !!u.id && a.created_by === u.id
}

/**
 * Anula el autor u operaciones. La nota automática solo operaciones: el asesor que
 * figura como autor no puede borrar el rastro del vínculo (D1).
 */
export function puedeAnular(a: Actividad, u: UsuarioMinimo): boolean {
  const alcance = alcanceContactos(u.role)
  if (alcance === 'ninguno') return false
  if (alcance === 'todos') return true
  if (a.automatic) return false
  return !!u.id && a.created_by === u.id
}

const MAX_DIRECCION_EN_NOTA = 200

/** ÚNICO lugar con el texto de la nota automática de `/cliente` (D2, D4). */
export function textoNotaDeVinculo(direccion: string | null): string {
  const d = direccion?.trim().slice(0, MAX_DIRECCION_EN_NOTA).trim()
  if (!d) return 'Nota automática: vinculó este contacto a un proceso suyo al completar los datos del cliente.'
  return `Nota automática: vinculó este contacto a su proceso de ${d} al completar los datos del cliente.`
}

/** Verdadero si no hay otro intento no anulado posterior del mismo proceso. */
export function esUltimoIntento(a: Intento, intentosDelProceso: Intento[]): boolean {
  const k = claveProceso(a.deal_id)
  return !intentosDelProceso.some(
    (i) => i.id !== a.id && esIntento(i) && claveProceso(i.deal_id) === k && compararIntentos(i, a) > 0,
  )
}

/** Los intentos del proceso hasta `a` inclusive, en orden. La racha se calcula con esto. */
export function intentosHasta(a: Intento, intentosDelProceso: Intento[]): Intento[] {
  const k = claveProceso(a.deal_id)
  const previos = intentosDelProceso.filter(
    (i) => i.id !== a.id && esIntento(i) && claveProceso(i.deal_id) === k && compararIntentos(i, a) <= 0,
  )
  return [...previos, a].sort(compararIntentos)
}

/** Lo que define "el mismo guardado" cuando un `client_token` llega dos veces. */
export interface DatosDelGuardado {
  kind: string
  call_outcome: string | null
  callback_at: string | null
  body: string | null
}

/**
 * ¿El pedido repetido trae los mismos datos que la fila ya guardada con ese `client_token`?
 * Un reintento de red sí; un formulario corregido y vuelto a mandar con el mismo token no
 * (revisión 12.1): devolver la fila vieja en silencio le haría creer a la persona que quedó lo
 * que corrigió. La hora se compara como instante (la base la devuelve con `+00:00` y el
 * servidor la arma con `Z`); texto vacío y sin texto son lo mismo, y las tildes NFC/NFD también.
 * `occurred_at` no entra: "hace N minutos" se recalcula en cada pedido.
 */
export function esElMismoGuardado(guardada: DatosDelGuardado, pedida: DatosDelGuardado): boolean {
  const texto = (t: string | null) => (t ?? '').normalize('NFC')
  const instante = (t: string | null) => (t ? Date.parse(t) : null)
  return (
    guardada.kind === pedida.kind &&
    (guardada.call_outcome ?? null) === (pedida.call_outcome ?? null) &&
    instante(guardada.callback_at) === instante(pedida.callback_at) &&
    texto(guardada.body) === texto(pedida.body)
  )
}
