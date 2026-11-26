// Validación de los datos de un contacto que llegan por `POST /api/contacts` y
// `PUT /api/contacts/[id]` (design.md D4, tareas 5.2 y 5.3), y el recorte de lo que ve un
// asesor en `GET /api/contacts/[id]`. Puro.
//
// Lista CERRADA de campos: antes el cuerpo crudo iba al insert/update, así que desde el
// navegador se podía colar `created_by` o reasignarse un contacto ajeno.
import { z } from 'zod'

// Los cuatro valores del CHECK de `contacts.origin`. Se tocan JUNTOS: un valor que el
// CHECK no conoce hace fallar el guardado con 23514.
export const ORIGENES_CONTACTO = ['embudo', 'referido', 'historico', 'clase_gratuita'] as const

const MAX_CORTO = 200
const MAX_NOTAS = 10_000
const CAMPOS = ['full_name', 'phone', 'email', 'origin', 'notes', 'assigned_to'] as const
type Campo = (typeof CAMPOS)[number]

export interface DatosContacto {
  full_name?: string
  phone?: string | null
  email?: string | null
  origin?: (typeof ORIGENES_CONTACTO)[number] | null
  notes?: string | null
  assigned_to?: string | null
}

const normalizar = (s: string) => s.normalize('NFC').trim()

// Texto que acepta null y vacío; los dos se guardan como null (ContactEditor manda null
// cuando el campo está vacío). NO se valida el formato del email ni del teléfono: un
// email viejo mal cargado no puede trabar la edición del resto del contacto.
const textoNulable = (max: number, mensajeLargo: string) =>
  z
    .union([z.string(), z.null()], { error: 'El dato tiene que ser texto.' })
    .transform((v) => (v === null ? null : normalizar(v) || null))
    .pipe(z.string().max(max, { error: mensajeLargo }).nullable())

const nombre = (mensajeFalta: string) =>
  z
    .string({ error: mensajeFalta })
    .transform(normalizar)
    .pipe(
      z
        .string()
        .min(1, { error: 'El nombre no puede quedar vacío.' })
        .max(MAX_CORTO, { error: `El nombre no puede pasar de ${MAX_CORTO} caracteres.` }),
    )

const esquema = (modo: 'crear' | 'editar') =>
  z.object({
    full_name: modo === 'crear' ? nombre('El nombre es obligatorio.') : nombre('El nombre no puede quedar vacío.').optional(),
    phone: textoNulable(MAX_CORTO, `El teléfono no puede pasar de ${MAX_CORTO} caracteres.`).optional(),
    email: textoNulable(MAX_CORTO, `El email no puede pasar de ${MAX_CORTO} caracteres.`).optional(),
    origin: textoNulable(MAX_CORTO, 'Origen no válido.')
      .pipe(z.enum(ORIGENES_CONTACTO, { error: 'Origen no válido.' }).nullable())
      .optional(),
    notes: textoNulable(MAX_NOTAS, `El texto no puede pasar de ${MAX_NOTAS} caracteres.`).optional(),
    // Que el perfil EXISTA lo comprueba la ruta contra la base (si no, la FK daba un 500).
    assigned_to: textoNulable(MAX_CORTO, 'Ese usuario no existe.')
      .pipe(z.uuid({ error: 'Ese usuario no existe.' }).nullable())
      .optional(),
  })

/**
 * Deja solo la lista cerrada. `created_by` nunca pasa (lo pone el servidor) y
 * `assigned_to` de quien no puede reasignar se descarta EN SILENCIO: el resto se guarda,
 * como dice la spec. Al editar el esquema es parcial pero exige al menos un campo.
 */
export function sanearDatosContacto(
  body: unknown,
  opciones: { modo: 'crear' | 'editar'; puedeReasignar: boolean },
): { ok: true; cambios: DatosContacto } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'No hay nada para guardar.' }
  }
  const crudo = body as Record<string, unknown>
  const presentes = CAMPOS.filter(
    (c): c is Campo => c in crudo && (c !== 'assigned_to' || opciones.puedeReasignar),
  )
  if (opciones.modo === 'editar' && presentes.length === 0) {
    return { ok: false, error: 'No hay nada para guardar.' }
  }
  const entrada: Record<string, unknown> = {}
  for (const c of presentes) entrada[c] = crudo[c]
  const r = esquema(opciones.modo).safeParse(entrada)
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? 'Datos no válidos.' }
  const cambios: DatosContacto = {}
  for (const c of presentes) {
    const valor = r.data[c]
    if (valor !== undefined) Object.assign(cambios, { [c]: valor })
  }
  return { ok: true, cambios }
}

type ConAsesor = { assigned_to?: string | null }
type ConAutor = ConAsesor & { user_id?: string | null }

/**
 * Lo que un asesor ve dentro de un contacto que sí puede abrir: solo los procesos,
 * tasaciones, propiedades y tasaciones agendadas (tabla vieja) a su nombre. Un proceso
 * sin asesor no es suyo. Operaciones no pasa por acá.
 */
export function soloLoPropio<
  C,
  D extends ConAsesor,
  A extends ConAutor,
  P extends ConAsesor,
  S extends ConAsesor,
>(datos: { contact: C; deals: D[]; appraisals: A[]; properties: P[]; scheduled: S[] }, usuarioId: string) {
  const mio = (x: string | null | undefined) => !!usuarioId && x === usuarioId
  return {
    contact: datos.contact,
    deals: datos.deals.filter((d) => mio(d.assigned_to)),
    appraisals: datos.appraisals.filter((a) => mio(a.assigned_to) || mio(a.user_id)),
    properties: datos.properties.filter((p) => mio(p.assigned_to)),
    scheduled: datos.scheduled.filter((s) => mio(s.assigned_to)),
  }
}
