import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'
import type { DealStage } from '@/lib/supabase/deals'
import { ROLE_PERMISSIONS } from '@/lib/auth/roles'
import type { Role } from '@/types/auth.types'

/**
 * Reglas del trabajo MANUAL: una tasación o una captación que el asesor carga a
 * mano (un referido, un cliente histórico, alguien que llamó).
 *
 * POR QUÉ EXISTE (2026-09-17): la tasación manual creaba el proceso desde el
 * NAVEGADOR con datos inventados — el contacto era la dirección, sin teléfono,
 * sin asesor, origen forzado a "Histórico" y la etapa saltaba directo a
 * "Tasación Entregada". Resultado: el asesor no veía su propia tasación en el
 * CRM (solo ve los procesos asignados a él), nunca se abría el formulario de
 * visita y salía un email falso de "Tasación agendada".
 *
 * Decisiones del dueño que este módulo hace cumplir:
 *  1. No se inventan orígenes: una tasación manual es de un referido o de un
 *     histórico. Los tres valores son los que la base ya acepta.
 *  2. No se saltea ninguna etapa: el proceso nace donde corresponde y avanza
 *     con los mismos botones que cualquier otro.
 *  3. Sin cliente de verdad (nombre + teléfono) y sin asesor, no se crea nada.
 *
 * Módulo PURO: sin red, sin base, sin React.
 */

/** Motivo por el que se crea el proceso a mano. */
export type MotivoProceso = 'tasacion' | 'captacion'

/**
 * Orígenes válidos para un proceso manual. Son exactamente los que aceptan los
 * CHECK de `deals.origin` y `contacts.origin` (verificado contra la base el
 * 2026-09-17). `clase_gratuita` queda afuera a propósito: lo escribe el embudo,
 * no una persona. `tasacion` NO es un origen: la base lo rechaza, aunque alguna
 * pantalla lo ofrecía.
 */
export const ORIGENES_MANUALES = ['embudo', 'referido', 'historico'] as const
export type OrigenManual = (typeof ORIGENES_MANUALES)[number]

const TIPOS = ['departamento', 'casa', 'ph', 'otro'] as const
type TipoPropiedad = (typeof TIPOS)[number]

export interface ClienteNuevoInput {
  nombre?: string
  telefono?: string
  email?: string | null
  origen?: string
  asesorId?: string | null
  direccion?: string
  tipo?: string
  tipoOtro?: string | null
  barrio?: string
  ambientes?: number | string
  /** Fecha de la visita a la propiedad, en AAAA-MM-DD. */
  fechaVisita?: string
}

export interface ClienteNuevo {
  nombre: string
  telefono: string
  /** Últimos 10 dígitos: con esto se busca si el contacto ya existe. */
  telefonoNormalizado: string
  email: string | null
  origen: OrigenManual
  asesorId: string
  direccion: string
  tipo: TipoPropiedad
  tipoOtro: string | null
  barrio: string
  ambientes: number
  fechaVisita: string
}

export type Validacion<T> = { ok: true; valor: T } | { ok: false; errores: string[] }

const FECHA = /^\d{4}-\d{2}-\d{2}$/
// Un email con arroba, algo antes, algo después y un punto en el dominio.
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

function esFechaReal(valor: string): boolean {
  if (!FECHA.test(valor)) return false
  const [a, m, d] = valor.split('-').map(Number)
  const fecha = new Date(Date.UTC(a, m - 1, d))
  return fecha.getUTCFullYear() === a && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d
}

/**
 * Valida y limpia los datos del cliente nuevo. Junta TODOS los errores: que el
 * asesor los corrija de una vez y no de a uno.
 */
export function validarClienteNuevo(input: ClienteNuevoInput): Validacion<ClienteNuevo> {
  const errores: string[] = []

  const nombre = (input.nombre ?? '').trim()
  if (nombre.length < 2) errores.push('Falta el nombre del propietario.')

  const telefono = (input.telefono ?? '').trim()
  const telefonoNormalizado = ultimos10Digitos(telefono)
  if (!telefonoNormalizado) errores.push('El teléfono tiene que tener al menos 10 dígitos (código de área y número).')

  const emailCrudo = (input.email ?? '').trim().toLowerCase()
  if (emailCrudo && !EMAIL.test(emailCrudo)) errores.push('El email no parece válido.')

  const origen = (input.origen ?? '').trim() as OrigenManual
  if (!ORIGENES_MANUALES.includes(origen)) {
    errores.push(`Elegí el origen: ${ORIGENES_MANUALES.join(', ')}.`)
  }

  const asesorId = (input.asesorId ?? '').trim()
  if (!asesorId) errores.push('Elegí el asesor: sin asesor el proceso no le aparece en su CRM.')

  const direccion = (input.direccion ?? '').trim()
  if (!direccion) errores.push('Falta la dirección de la propiedad.')

  const barrio = (input.barrio ?? '').trim()
  if (!barrio) errores.push('Falta el barrio o la localidad.')

  const tipo = (input.tipo ?? '').trim() as TipoPropiedad
  if (!TIPOS.includes(tipo)) errores.push('Elegí el tipo de propiedad.')
  const tipoOtro = (input.tipoOtro ?? '').trim()
  if (tipo === 'otro' && !tipoOtro) errores.push('Aclará qué tipo de propiedad es.')

  const ambientes = Number(input.ambientes)
  if (!Number.isFinite(ambientes) || ambientes < 1) errores.push('Los ambientes tienen que ser 1 o más.')

  const fechaVisita = (input.fechaVisita ?? '').trim()
  if (!esFechaReal(fechaVisita)) errores.push('Poné la fecha de la visita con el formato AAAA-MM-DD.')

  if (errores.length > 0) return { ok: false, errores }
  return {
    ok: true,
    valor: {
      nombre,
      telefono,
      telefonoNormalizado: telefonoNormalizado!,
      email: emailCrudo || null,
      origen,
      asesorId,
      direccion,
      tipo,
      tipoOtro: tipo === 'otro' ? tipoOtro : null,
      barrio,
      ambientes,
      fechaVisita,
    },
  }
}

/**
 * Dónde nace el proceso. NINGUNA etapa se saltea (decisión del dueño): una
 * tasación manual es una tasación agendada como cualquier otra y de ahí avanza
 * con los botones de siempre; una captación manual ya tiene la propiedad.
 */
export function etapaInicial(motivo: MotivoProceso): DealStage {
  return motivo === 'captacion' ? 'captured' : 'scheduled'
}

/**
 * ¿Se manda el email de "Tasación agendada" al crear el proceso? No: ese aviso
 * es para cuando el equipo coordina una visita FUTURA. Acá se está registrando
 * trabajo ya hecho, y ese email falso le llegaba al dueño por cada tasación.
 */
export function debeNotificarCreacion(motivo: MotivoProceso): boolean {
  // Hoy ningún motivo notifica. Se recibe igual para que, si mañana se quiere
  // avisar de alguno, el cambio sea acá y quede cubierto por su test.
  return motivo !== 'tasacion' && motivo !== 'captacion'
}

export interface ProcesoDeTasacion {
  id: string
  stage: string
}

export interface EntradaCaptacion {
  /** Proceso elegido a mano en la pantalla, si lo hubo. */
  dealIdElegido?: string | null
  /** Procesos que ya apuntan a esa tasación. */
  procesosDeLaTasacion?: ProcesoDeTasacion[]
  /** Propiedades NO descartadas que ya cuelgan del proceso resuelto. */
  propiedadesActivasDelProceso?: { id: string }[]
}

export type ResolucionCaptacion =
  | { tipo: 'proceso'; dealId: string }
  | { tipo: 'elegir'; motivo: 'sin_proceso' | 'varios_procesos' }
  | { tipo: 'duplicado'; propertyId: string }

/**
 * Con qué proceso se vincula una captación. Nunca inventa: si no hay un único
 * candidato, la pantalla tiene que preguntar. Y si el proceso ya tiene una
 * propiedad activa, frena — así no vuelve a pasar lo de captar dos veces la
 * misma tasación (Hipólito Yrigoyen 1550, 14/9 y 17/9).
 */
export function resolverProcesoDeCaptacion(entrada: EntradaCaptacion): ResolucionCaptacion {
  const activas = entrada.propiedadesActivasDelProceso ?? []
  const elegido = (entrada.dealIdElegido ?? '').trim()
  if (elegido) {
    return activas.length > 0 ? { tipo: 'duplicado', propertyId: activas[0].id } : { tipo: 'proceso', dealId: elegido }
  }
  const procesos = entrada.procesosDeLaTasacion ?? []
  if (procesos.length === 0) return { tipo: 'elegir', motivo: 'sin_proceso' }
  if (procesos.length > 1) return { tipo: 'elegir', motivo: 'varios_procesos' }
  if (activas.length > 0) return { tipo: 'duplicado', propertyId: activas[0].id }
  return { tipo: 'proceso', dealId: procesos[0].id }
}

export interface ProcesoEncontrado {
  id: string
  propertyAddress?: string | null
  contactoNombre?: string | null
  stage?: string
  origin?: string | null
}

/**
 * Junta los procesos que aparecieron buscando por dirección y por contacto.
 * Primero los de dirección (es lo que el asesor tipea casi siempre), sin
 * repetir y con tope: el desplegable tiene que ser elegible de un vistazo.
 */
export function combinarProcesosEncontrados(
  porDireccion: ProcesoEncontrado[],
  porContacto: ProcesoEncontrado[],
  limite = 10,
): ProcesoEncontrado[] {
  const vistos = new Set<string>()
  const salida: ProcesoEncontrado[] = []
  for (const p of [...porDireccion, ...porContacto]) {
    if (!p?.id || vistos.has(p.id)) continue
    vistos.add(p.id)
    salida.push(p)
    if (salida.length >= limite) break
  }
  return salida
}

/** Minúsculas, sin tildes ni signos: para comparar nombres y direcciones. */
export function normalizar(texto: string | null | undefined): string {
  return (texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

export interface DatosDelProceso {
  /** Etapa del proceso: en algunas, que falte el asesor es lo normal. */
  stage?: string | null
  contactoNombre?: string | null
  contactoTelefono?: string | null
  propertyAddress?: string | null
  assignedTo?: string | null
}

/**
 * ¿El "nombre" del contacto es en realidad la dirección? Así nacían los
 * contactos del camino viejo ("Av. Hipólito Yrigoyen 1550").
 *
 * Exige un NÚMERO en el nombre: un nombre de persona no lleva altura de calle.
 * Sin eso, "Ana" en "Anatole France 200" se marcaba como dirección, porque una
 * dirección que empieza igual que un nombre corto es de lo más común.
 */
function nombreEsLaDireccion(nombre: string, direccion: string): boolean {
  if (!nombre || !direccion || !/[0-9]/.test(nombre)) return false
  return direccion.startsWith(nombre) || nombre.startsWith(direccion)
}

/**
 * Qué le falta a un proceso para ser un proceso de verdad, en palabras para el
 * asesor. Vacío = está completo. Sirve para el aviso de la ficha: decir QUÉ
 * falta en vez de un genérico "completá los datos".
 */
/**
 * Etapas donde NO se exige nada: una solicitud del embudo todavía no tiene
 * asesor por diseño (se asigna al coordinar), y un proceso cerrado no tiene
 * nada que completar. Sin esto, el aviso salía en CADA solicitud nueva.
 */
const ETAPAS_SIN_EXIGENCIA: readonly string[] = ['request', 'clase_gratuita', 'lost', 'comprador']

export function faltantesDelProceso(deal: DatosDelProceso): string[] {
  if (deal.stage && ETAPAS_SIN_EXIGENCIA.includes(deal.stage)) return []
  const faltan: string[] = []
  const nombre = normalizar(deal.contactoNombre)
  if (!nombre) faltan.push('el nombre del propietario')
  else if (nombreEsLaDireccion(nombre, normalizar(deal.propertyAddress))) {
    faltan.push('el nombre real del propietario (hoy figura la dirección)')
  }
  if (!(deal.contactoTelefono ?? '').trim()) faltan.push('el teléfono')
  if (!(deal.assignedTo ?? '').trim()) faltan.push('el asesor')
  return faltan
}

/**
 * ¿Este proceso quedó a medias por el camino viejo? Señales: el "cliente" es la
 * dirección, no hay teléfono, o no hay asesor.
 */
export function pareceProcesoIncompleto(deal: DatosDelProceso): boolean {
  return faltantesDelProceso(deal).length > 0
}

/**
 * ¿Puede este rol mover un proceso de un asesor a otro? Solo quien ve todo el
 * pipeline. Se decide por PERMISO, no por nombre de rol, como en
 * `lib/auth/scope.ts`; un rol desconocido cae del lado seguro. La usan la ruta
 * (que es la barrera real) y la pantalla (para no ofrecer un botón que después
 * va a responder 403).
 */
export function puedeReasignarAsesor(role: string | null | undefined): boolean {
  if (!role) return false
  const permisos = ROLE_PERMISSIONS[role as Role] as string[] | undefined
  return !!permisos?.includes('pipeline.view_all')
}
