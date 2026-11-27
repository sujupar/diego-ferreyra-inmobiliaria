// La fila de la cartera del CRM (crm-cartera-por-rol, design.md D3 y D5). Puro: sin red,
// sin base y sin reloj propio (`ahora` llega por parámetro). El servidor arma las filas con
// esto y el navegador solo filtra, agrupa y ordena (D4): así la ficha, el CRM, Contactos y
// (más adelante) el Inicio dicen lo mismo de la misma persona.
import { procesoEnVista, type Vista } from './cartera-vista'
import { estaAbierto, etapaCRM, type EtapaCRM } from './etapas'
import {
  HORARIO_LABORAL,
  diasDeCalendarioEntre,
  enArgentina,
  esDiaHabil,
  instanteDesdeAR,
  siguienteDiaHabil,
} from './horario-laboral'
import { tareasVisiblesEnFicha, vencimientoDeTarea } from './tareas-ficha'
import { INICIO_REGISTRO_CONTACTOS, anteriorAlRegistro, type ContactoRegistrado } from './ultimo-contacto'

/**
 * Las tareas que cuentan para el próximo paso: llamada, seguimiento y asignación. Lista
 * EXPLÍCITA: un tipo nuevo no entra hasta que alguien lo agregue acá. Las de propiedades
 * (`informe_quincenal`, `review_property`, `rejected_docs`, `complete_imported_property`)
 * no son de la persona.
 */
export const TIPOS_TAREA_DE_PROCESO = ['update_contact', 'follow_up', 'new_assignment'] as const

/** Respuesta 2 del dueño (2026-11-26). */
export const SIN_MOVIMIENTO_DIAS = 14

/** `createTaskForRole` inserta las copias una tras otra: entre hermanas hay milisegundos. */
const COPIAS_MS = 60_000

/** Etapas en las que el proceso ya tendría que tener asesor (spec "Cuándo un proceso está trabado"). */
const ETAPAS_CON_ASESOR: readonly EtapaCRM[] = ['coordinada', 'no_realizada', 'realizada', 'entregada', 'seguimiento']

const NOMBRE_TIPO_PROPIEDAD: Record<string, string> = { departamento: 'Depto', ph: 'PH', casa: 'Casa' }

export interface ProcesoLeido {
  id: string
  stage: string
  scheduled_date: string | null
  scheduled_time: string | null
  origin: string | null
  assigned_to: string | null
  created_at: string
  property_type: string | null
  property_type_other: string | null
  rooms: number | null
  neighborhood: string | null
  property_address: string | null
  tags: string[] | null
  captured_at: string | null
  lost_at: string | null
  stage_changed_at: string | null
  contact_id: string | null
  contacto: { id: string; full_name: string; phone: string | null; email: string | null; created_at: string } | null
}

export interface TareaLeida {
  id: string
  type: string
  title: string
  assigned_to: string | null
  deal_id: string | null
  contact_id: string | null
  due_date: string | null
  due_time: string | null
  all_day: boolean | null
  channel: string | null
  created_at: string
  source_activity_id: string | null
  status: string
}

export interface PerfilCartera {
  nombre: string
  role: string
  activo: boolean
}

export interface ProximoPaso {
  clase: 'tarea' | 'tasacion'
  titulo: string // 'Llamada 2' | 'Primera llamada' | 'Tasación' | 'Cargar el resultado de la tasación'
  vence: { due_date: string | null; due_time: string | null; all_day: boolean }
  quien: { id: string; nombre: string } | null
  espera: { registradoEn: string } | null
  instante: string | null // para ordenar; null = sin fecha
}

export interface TasacionDeFila {
  fecha: string
  hora: string | null // null = todo el día
  // Para ordenar: la hora, o el final del día si no tiene (va después de las que tienen hora).
  instante: string
  asesor: string | null
  direccion: string | null
}

export interface FilaCartera {
  id: string
  contactoId: string | null
  nombre: string
  telefono: string | null
  email: string | null
  propiedad: string
  direccion: string
  etapa: EtapaCRM
  abierto: boolean
  origen: string | null
  asesor: { id: string; nombre: string; activo: boolean } | null
  creadoEn: string
  cerradoEn: string | null
  colega: boolean
  anteriorAlRegistro: boolean
  ultimoContacto: ContactoRegistrado | null | 'error'
  proximo: ProximoPaso | null | 'error'
  tasacion: TasacionDeFila | null
}

/**
 * Lo que tienen en común la fila del CRM y la de Contactos (una persona sin ningún proceso
 * no tiene etapa). Filtros, orden y las reglas de "trabado" trabajan sobre esto: así las
 * dos listas usan las mismas funciones (design.md D5, "las funciones son genéricas").
 */
export type FilaComun = Omit<FilaCartera, 'etapa'> & { etapa: EtapaCRM | null }

export interface TareaConQuien extends TareaLeida {
  quien: { id: string; nombre: string } | null
}

// ── Utilidades ───────────────────────────────────────────────────────────────────────────

function sinMarcas(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/**
 * "Llamada 2 a Sofía Lanús" → "Llamada 2". Compara sin tildes y sin mayúsculas, y sin
 * expresiones regulares (un nombre con `(` o `*` no rompe nada). Trabaja sobre el título en
 * NFC: así cada letra con tilde ocupa un lugar y el corte cae donde corresponde aunque el
 * título o el nombre llegaran descompuestos (macOS). Si el nombre no está al final, el
 * título queda como está.
 */
export function quitarNombreDelTitulo(titulo: string, nombre: string): string {
  const n = sinMarcas(nombre.trim())
  if (!n) return titulo
  const original = titulo.normalize('NFC')
  const plano = sinMarcas(original)
  for (const nexo of [' a ', ' con ', ' de ']) {
    const sufijo = nexo + n
    if (plano.endsWith(sufijo)) return original.slice(0, plano.length - sufijo.length).trim()
  }
  return titulo
}

function horaHHMM(h: string | null): string | null {
  return h ? h.slice(0, 5) : null
}

/** Instante en que vence: con hora, esa hora; con fecha sola, el final del día; sin fecha, null. */
function instanteDeVencimiento(v: { due_date: string | null; due_time: string | null }): string | null {
  if (!v.due_date) return null
  try {
    return instanteDesdeAR(v.due_date, horaHHMM(v.due_time) ?? '23:59').toISOString()
  } catch {
    return null
  }
}

function esLlamada(t: { type: string; channel: string | null }): boolean {
  return t.type === 'update_contact' || (t.type === 'follow_up' && t.channel === 'call')
}

export function textoPropiedad(p: ProcesoLeido): string {
  const tipo =
    p.property_type === 'otro'
      ? p.property_type_other?.trim() || null
      : p.property_type
        ? (NOMBRE_TIPO_PROPIEDAD[p.property_type] ?? p.property_type.charAt(0).toUpperCase() + p.property_type.slice(1))
        : null
  const partes = [[tipo, p.rooms ? `${p.rooms} amb` : null].filter(Boolean).join(' '), p.neighborhood?.trim() || null]
  return partes.filter(Boolean).join(' · ')
}

function cierreDe(p: ProcesoLeido, etapa: EtapaCRM): string | null {
  if (etapa === 'captada') return p.captured_at ?? p.stage_changed_at
  if (etapa === 'descartado') return p.lost_at ?? p.stage_changed_at
  return null
}

/**
 * Vencimiento de la tarea de entrada sin fecha de un lead nuevo (D3): si entró en horario
 * laboral, vence en el momento del registro y se dice "Espera hace …"; si entró fuera,
 * vence a las 9:00 del día hábil siguiente (o del mismo día si entró de madrugada). Sin
 * esto, toda solicitud nueva diría "Sin fecha" y quedaría al final, al revés de la urgencia.
 */
function venceDePrimeraLlamada(registradoEn: string): { due_date: string; due_time: string; espera: boolean } | null {
  const r = new Date(registradoEn)
  if (Number.isNaN(r.getTime())) return null
  const ar = enArgentina(r)
  if (esDiaHabil(ar.fecha)) {
    if (ar.hora >= HORARIO_LABORAL.inicio && ar.hora < HORARIO_LABORAL.fin) return { due_date: ar.fecha, due_time: ar.hora, espera: true }
    if (ar.hora < HORARIO_LABORAL.inicio) return { due_date: ar.fecha, due_time: HORARIO_LABORAL.inicio, espera: false }
  }
  const s = siguienteDiaHabil(r)
  return { due_date: s.fecha, due_time: s.hora, espera: false }
}

// ── Copias de la coordinación ────────────────────────────────────────────────────────────

/**
 * `createTaskForRole` crea una copia de la tarea por cada coordinador activo; cuando una la
 * completa, la otra queda pendiente para siempre. Copias = asignadas a coordinadores, sin
 * `source_activity_id`, mismo proceso, tipo y título, creadas con 60 s o menos de
 * diferencia (diferencia entre instantes, no "el mismo minuto": 12:00:59,9 y 12:01:00,1
 * son hermanas). Si alguna hermana se cerró (completada o descartada), no cuenta ninguna;
 * si siguen todas pendientes, cuentan una vez (`copias` dice cuántas eran). Una tarea de la
 * cadencia (con `source_activity_id`) nunca es copia: "Enviar WhatsApp" se repite a
 * propósito en el mismo proceso.
 */
export function colapsarCopiasDeCoordinacion<T extends TareaLeida>(
  pendientes: T[],
  cerradas: TareaLeida[],
  esCoordinador: (id: string | null) => boolean,
): { tarea: T; copias: number }[] {
  const esCandidata = (t: TareaLeida) => esCoordinador(t.assigned_to) && !t.source_activity_id
  const salida: { tarea: T; copias: number }[] = []
  const grupos = new Map<string, { t: TareaLeida; pendiente: T | null }[]>()
  for (const t of pendientes) {
    if (!esCandidata(t)) {
      salida.push({ tarea: t, copias: 1 })
      continue
    }
    const k = `${t.deal_id}|${t.type}|${t.title}`
    grupos.set(k, [...(grupos.get(k) ?? []), { t, pendiente: t }])
  }
  for (const t of cerradas) {
    if (!esCandidata(t)) continue
    const k = `${t.deal_id}|${t.type}|${t.title}`
    const g = grupos.get(k)
    if (g) g.push({ t, pendiente: null }) // sin pendientes en el grupo, no hay nada que anular
  }
  for (const g of grupos.values()) {
    g.sort((a, b) => Date.parse(a.t.created_at) - Date.parse(b.t.created_at))
    let racimo: typeof g = []
    const cerrarRacimo = () => {
      const vivas = racimo.flatMap((x) => (x.pendiente ? [x.pendiente] : []))
      const algunaCerrada = racimo.some((x) => !x.pendiente)
      if (vivas.length > 0 && !algunaCerrada) salida.push({ tarea: vivas[0], copias: vivas.length })
      racimo = []
    }
    for (const x of g) {
      // Contra la PRIMERA del racimo, no la última: encadenando, un racimo podía abarcar más
      // de 60 s entre sus extremos y anular una copia que no lo era (auditoría, B7).
      const primera = racimo[0]
      if (primera && Date.parse(x.t.created_at) - Date.parse(primera.t.created_at) > COPIAS_MS) cerrarRacimo()
      racimo.push(x)
    }
    cerrarRacimo()
  }
  return salida
}

// ── Próximo paso ─────────────────────────────────────────────────────────────────────────

/**
 * Lo primero que vence entre las tareas (ya filtradas para la vista) y la tasación del
 * proceso. La tasación que ya pasó sigue siendo el próximo paso: "Cargar el resultado de
 * la tasación", vencida desde ese día (13 de 15 Coordinadas estaban así el 2026-11-26);
 * "Nada agendado" escondería trabajo atrasado. Sin hora, la tasación es de todo el día y
 * vence recién al día siguiente (la misma regla que una tarea con fecha sola).
 */
export function proximoPaso(e: {
  tareas: TareaConQuien[]
  tasacion: TasacionDeFila | null
  quienTasacion: { id: string; nombre: string } | null
  etapa: EtapaCRM | null // null = la persona no tiene proceso (Contactos): nunca es "Primera llamada"
  hayContactos: boolean
  registradoEn: string
  nombrePersona: string
  ahora: Date
  /**
   * Vista de la coordinación: la tasación ya pasada es trabajo del asesor ("Cargar el
   * resultado"), así que solo es el próximo paso si ella no tiene ninguna tarea en el proceso.
   * Si compitiera por fecha, una llamada vencida suya quedaría escondida fuera de "Llamada o
   * mensaje vencido" (auditoría del código, M1). Una tasación futura sigue compitiendo.
   */
  tasacionVencidaSoloSinTareas?: boolean
}): ProximoPaso | null {
  const candidatos: (ProximoPaso & { creado: string })[] = []
  const primeraLlamada = e.etapa === 'solicitud' && !e.hayContactos

  for (const t of e.tareas) {
    const llamada = esLlamada(t)
    let vence = { due_date: t.due_date, due_time: horaHHMM(t.due_time), all_day: t.all_day === true }
    let espera: ProximoPaso['espera'] = null
    if (!t.due_date && llamada && primeraLlamada && !anteriorAlRegistro(e.registradoEn)) {
      const calculado = venceDePrimeraLlamada(e.registradoEn)
      if (calculado) {
        vence = { due_date: calculado.due_date, due_time: calculado.due_time, all_day: false }
        if (calculado.espera) espera = { registradoEn: e.registradoEn }
      }
    }
    candidatos.push({
      clase: 'tarea',
      titulo: llamada && primeraLlamada ? 'Primera llamada' : quitarNombreDelTitulo(t.title, e.nombrePersona),
      vence,
      quien: t.quien,
      espera,
      instante: instanteDeVencimiento(vence),
      creado: t.created_at,
    })
  }

  const vencida = (v: { due_date: string; due_time: string | null; all_day: boolean }) => vencimientoDeTarea(v, e.ahora).vencida
  if (e.tasacion) {
    const vence = { due_date: e.tasacion.fecha, due_time: e.tasacion.hora, all_day: !e.tasacion.hora }
    const cede = e.tasacionVencidaSoloSinTareas === true && candidatos.length > 0 && vencida(vence)
    if (!cede) candidatos.push({
      clase: 'tasacion',
      titulo: vencida(vence) ? 'Cargar el resultado de la tasación' : 'Tasación',
      vence,
      quien: e.quienTasacion,
      espera: null,
      instante: instanteDeVencimiento(vence),
      creado: e.tasacion.instante,
    })
  }

  if (candidatos.length === 0) return null
  candidatos.sort((a, b) => {
    if (a.instante && b.instante && a.instante !== b.instante) return Date.parse(a.instante) - Date.parse(b.instante)
    if (a.instante && !b.instante) return -1
    if (!a.instante && b.instante) return 1
    return Date.parse(a.creado) - Date.parse(b.creado)
  })
  const c = candidatos[0]
  return { clase: c.clase, titulo: c.titulo, vence: c.vence, quien: c.quien, espera: c.espera, instante: c.instante }
}

// ── Las filas ────────────────────────────────────────────────────────────────────────────

/** La tasación agendada del proceso (Coordinada con día), o null. La usan el CRM y Contactos. */
export function tasacionDe(p: ProcesoLeido, asesor: string | null): TasacionDeFila | null {
  if (etapaCRM(p) !== 'coordinada' || !p.scheduled_date) return null
  const hora = horaHHMM(p.scheduled_time)
  const instante = instanteDeVencimiento({ due_date: p.scheduled_date, due_time: hora })
  return instante ? { fecha: p.scheduled_date, hora, instante, asesor, direccion: p.property_address } : null
}

/**
 * A quién se le rotula la tarea. Cuando cuentan las tareas de cualquiera (vista del dueño,
 * Contactos del equipo) se juntan las copias de la coordinación ("· coordinación") y se
 * nombra a quien la tiene, salvo que sea el asesor de la fila (ya está en su columna).
 * Cuando cuentan solo las de quien mira, no se rotula nada.
 */
export function tareasConQuien(e: {
  tareas: TareaLeida[]
  deCualquiera: boolean
  tareasCerradas: TareaLeida[]
  perfiles: Map<string, PerfilCartera>
  asesorDeLaFila: string | null
}): TareaConQuien[] {
  if (!e.deCualquiera) return e.tareas.map((t) => ({ ...t, quien: null }))
  const esCoordinador = (id: string | null) => !!id && e.perfiles.get(id)?.role === 'coordinador'
  return colapsarCopiasDeCoordinacion(e.tareas, e.tareasCerradas, esCoordinador).map(({ tarea, copias }) => ({
    ...tarea,
    quien:
      copias > 1
        ? { id: 'coordinacion', nombre: 'coordinación' }
        : tarea.assigned_to && tarea.assigned_to !== e.asesorDeLaFila
          ? { id: tarea.assigned_to, nombre: e.perfiles.get(tarea.assigned_to)?.nombre ?? 'Sin nombre' }
          : null,
  }))
}

/**
 * Una fila por proceso de la vista. `procesoEnVista` se aplica OTRA VEZ acá aunque la
 * consulta ya filtró: si la consulta se ensancha por error, igual no sale nada ajeno. Las
 * tareas de un proceso fuera de la vista nunca llegan a una fila (se toman por proceso).
 * `tareasCerradas` son las de coordinación completadas o descartadas (lectura (d) de D4),
 * solo para anular copias; `tareas === 'error'` o `ultimos === 'error'` se propagan a la
 * fila: nunca se rellena con un vacío lo que no se pudo leer.
 */
export function armarFilasCartera(e: {
  vista: Vista
  procesos: ProcesoLeido[]
  tareas: TareaLeida[] | 'error'
  tareasCerradas: TareaLeida[]
  ultimos: Map<string, ContactoRegistrado> | 'error'
  perfiles: Map<string, PerfilCartera>
  ahora: Date
}): FilaCartera[] {
  const { vista, perfiles, ahora } = e
  const nombreDe = (id: string) => perfiles.get(id)?.nombre ?? 'Sin nombre'
  const personaDeLaVista = vista.tipo === 'dueno' ? null : vista.personaId

  const porProceso = new Map<string, TareaLeida[]>()
  if (e.tareas !== 'error') {
    for (const t of e.tareas) {
      if (!t.deal_id || t.status !== 'pending') continue
      if (!TIPOS_TAREA_DE_PROCESO.some((tipo) => tipo === t.type)) continue
      if (personaDeLaVista && t.assigned_to !== personaDeLaVista) continue
      porProceso.set(t.deal_id, [...(porProceso.get(t.deal_id) ?? []), t])
    }
  }

  const filas: FilaCartera[] = []
  for (const p of e.procesos) {
    const etapa = etapaCRM(p)
    if (!procesoEnVista({ etapa, origin: p.origin, assigned_to: p.assigned_to }, vista)) continue
    const abierto = estaAbierto(etapa)
    const asesor = p.assigned_to
      ? { id: p.assigned_to, nombre: nombreDe(p.assigned_to), activo: perfiles.get(p.assigned_to)?.activo === true }
      : null
    const contactoId = p.contacto?.id ?? null
    const ultimoContacto: FilaCartera['ultimoContacto'] =
      e.ultimos === 'error' ? 'error' : contactoId ? (e.ultimos.get(contactoId) ?? null) : null
    const conTasacion = etapa === 'coordinada' && !!p.scheduled_date
    const tasacion = tasacionDe(p, asesor?.nombre ?? null)
    const nombre = p.contacto?.full_name?.trim() || 'Sin nombre'

    let proximo: FilaCartera['proximo'] = null
    if (abierto) {
      if (e.tareas === 'error') proximo = 'error'
      else {
        // Regla (a) de la ficha: la asignación de un proceso con tasación agendada no se muestra.
        const visibles = tareasVisiblesEnFicha(porProceso.get(p.id) ?? [], {
          dealsConTasacionAgendada: conTasacion ? [p.id] : [],
          dealsOcultos: [],
          usuarioId: '',
          soloPropiasSinProceso: false,
        })
        proximo = proximoPaso({
          tareas: tareasConQuien({
            tareas: visibles,
            deCualquiera: vista.tipo === 'dueno',
            tareasCerradas: e.tareasCerradas,
            perfiles,
            asesorDeLaFila: p.assigned_to,
          }),
          tasacion,
          // La tasación es del asesor: la coordinación ve de quién es; el asesor es él mismo y
          // el dueño ya lo lee en la columna Asesor (el nombre no se repite).
          quienTasacion: vista.tipo === 'coordinacion' && asesor ? { id: asesor.id, nombre: asesor.nombre } : null,
          etapa,
          hayContactos: ultimoContacto !== null,
          registradoEn: p.created_at,
          nombrePersona: nombre,
          ahora,
          tasacionVencidaSoloSinTareas: vista.tipo === 'coordinacion',
        })
      }
    }

    filas.push({
      id: p.id,
      contactoId,
      nombre,
      telefono: p.contacto?.phone ?? null,
      email: p.contacto?.email ?? null,
      propiedad: textoPropiedad(p),
      direccion: p.property_address?.trim() ?? '',
      etapa,
      abierto,
      origen: p.origin,
      asesor,
      creadoEn: p.created_at,
      cerradoEn: cierreDe(p, etapa),
      colega: (p.tags ?? []).includes('colega'),
      anteriorAlRegistro: anteriorAlRegistro(p.created_at),
      ultimoContacto,
      proximo,
      tasacion,
    })
  }
  return filas
}

// ── Trabado (la misma regla en filas, grupos y "Lo que está trabado") ────────────────────

/** Solicitud abierta, desde el registro, sin ningún contacto. Con el dato en error: no. */
export function sinPrimerContacto(f: Pick<FilaComun, 'abierto' | 'etapa' | 'ultimoContacto' | 'anteriorAlRegistro'>): boolean {
  return f.abierto && f.etapa === 'solicitud' && f.ultimoContacto === null && !f.anteriorAlRegistro
}

/** Pasó la solicitud y nadie la tiene (o la tiene alguien dado de baja). */
export function sinAsesor(f: Pick<FilaComun, 'abierto' | 'etapa' | 'asesor'>): boolean {
  return f.abierto && f.etapa !== null && ETAPAS_CON_ASESOR.includes(f.etapa) && (!f.asesor || !f.asesor.activo)
}

/**
 * Seguimiento abierto con 14 días o más (de Argentina) sin contacto, contados desde el
 * último contacto o desde el inicio del registro, lo que sea más reciente: antes del
 * registro no se anotaba nada y no se puede afirmar que nadie llamó.
 */
export function sinMovimiento(f: Pick<FilaComun, 'abierto' | 'etapa' | 'ultimoContacto'>, ahora: Date): boolean {
  if (!f.abierto || f.etapa !== 'seguimiento') return false
  const dias = diasSinMovimiento(f, ahora)
  return dias !== null && dias >= SIN_MOVIMIENTO_DIAS
}

/**
 * Días de Argentina sin contacto que cuentan para "sin movimiento": desde el último
 * contacto o desde el inicio del registro, lo que sea más reciente. `null` si el dato
 * falló. Es el "22 días · " de "Lo que está trabado": una sola cuenta para la regla y el texto.
 */
export function diasSinMovimiento(f: Pick<FilaComun, 'ultimoContacto'>, ahora: Date): number | null {
  if (f.ultimoContacto === 'error') return null
  const inicio = instanteDesdeAR(INICIO_REGISTRO_CONTACTOS, '00:00')
  const ultimo = f.ultimoContacto ? new Date(f.ultimoContacto.at) : null
  const desde = ultimo && !Number.isNaN(ultimo.getTime()) && ultimo > inicio ? ultimo : inicio
  return diasDeCalendarioEntre(desde, ahora)
}

// ── La lista en memoria: filtros, orden y grupos (D4: el navegador no vuelve a pedir) ────

/** Todo texto: `useFiltrosUrl` exige `Record<string, string>`. */
export interface FiltrosCartera {
  seg: 'abiertos' | 'cerrados'
  etapa: EtapaCRM | ''
  origen: 'embudo' | 'referido' | 'historico' | ''
  asesor: string // id, 'sin' o ''
  entro: '' | 'hoy' | 'ayer' | '7' | '15' | '30' | '90' | 'rango'
  desde: string
  hasta: string
  q: string
  trabado: '' | 'sin-contacto' | 'sin-asesor' | 'sin-movimiento'
  orden: 'proximo' | 'ultimo' | 'nuevos' | 'nombre'
  colegas: '' | '1'
  ver: string
}

export type ClaveGrupo = 'sin-contacto' | 'vencidas' | 'tasaciones' | 'resto' | 'hoy' | 'proximos' | 'nada' | 'todos' | 'cerrados'

export interface Grupo {
  clave: ClaveGrupo
  filas: FilaCartera[]
  urgente: boolean
}

/** Sin tildes (NFD y NFC), en minúscula y con los espacios juntados. Sin regex del usuario. */
export function textoBusqueda(s: string): string {
  return sinMarcas(s).replace(/\s+/g, ' ').trim()
}

function textoDeLaFila(f: FilaComun): string {
  const digitos = (f.telefono ?? '').replace(/\D/g, '')
  return textoBusqueda([f.nombre, f.telefono, digitos, f.email, f.direccion, f.propiedad].filter(Boolean).join(' '))
}

function entroEnElRango(f: FilaComun, filtros: FiltrosCartera, ahora: Date): boolean {
  if (!filtros.entro) return true
  const creado = new Date(f.creadoEn)
  if (Number.isNaN(creado.getTime())) return false
  if (filtros.entro === 'rango') {
    const dia = enArgentina(creado).fecha
    return (!filtros.desde || dia >= filtros.desde) && (!filtros.hasta || dia <= filtros.hasta)
  }
  const dias = diasDeCalendarioEntre(creado, ahora)
  if (filtros.entro === 'hoy') return dias === 0
  if (filtros.entro === 'ayer') return dias === 1
  // "Últimos N días" = hoy y los N−1 anteriores, en días de Argentina.
  return dias >= 0 && dias < Number(filtros.entro)
}

/** Todos los filtros menos etapa y segmento (los usa `contarPorEtapa` tal cual). */
function pasaFiltrosComunes(f: FilaComun, filtros: FiltrosCartera, ahora: Date): boolean {
  if (f.colega && filtros.colegas !== '1') return false
  if (filtros.origen) {
    // "Embudo" incluye a los que vienen de la clase gratuita (spec "Embudo incluye la clase").
    const ok = filtros.origen === 'embudo' ? f.origen === 'embudo' || f.origen === 'clase_gratuita' : f.origen === filtros.origen
    if (!ok) return false
  }
  if (filtros.asesor) {
    if (filtros.asesor === 'sin' ? f.asesor !== null : f.asesor?.id !== filtros.asesor) return false
  }
  if (!entroEnElRango(f, filtros, ahora)) return false
  if (filtros.trabado === 'sin-contacto' && !sinPrimerContacto(f)) return false
  if (filtros.trabado === 'sin-asesor' && !sinAsesor(f)) return false
  if (filtros.trabado === 'sin-movimiento' && !sinMovimiento(f, ahora)) return false
  const palabras = textoBusqueda(filtros.q).split(' ').filter(Boolean)
  if (palabras.length > 0) {
    const texto = textoDeLaFila(f)
    if (!palabras.every((p) => texto.includes(p))) return false
  }
  return true
}

export function filtrarFilas<T extends FilaComun>(f: T[], filtros: FiltrosCartera, ahora: Date): T[] {
  return f.filter(
    (x) =>
      (filtros.seg === 'cerrados' ? !x.abierto : x.abierto) &&
      (!filtros.etapa || x.etapa === filtros.etapa) &&
      pasaFiltrosComunes(x, filtros, ahora),
  )
}

/**
 * Números de la barra de etapas y de "Abiertos/Cerrados": respetan todos los filtros menos
 * la etapa y el segmento (spec "Totales con filtros"), así tocar una etapa no hace que las
 * otras pasen a cero.
 */
export function contarPorEtapa(f: FilaCartera[], filtros: FiltrosCartera, ahora: Date): Record<EtapaCRM, number> {
  const c: Record<EtapaCRM, number> = {
    solicitud: 0, coordinada: 0, no_realizada: 0, realizada: 0, entregada: 0,
    seguimiento: 0, clase_gratuita: 0, comprador: 0, captada: 0, descartado: 0,
  }
  for (const x of f) if (pasaFiltrosComunes(x, filtros, ahora)) c[x.etapa] += 1
  return c
}

const ms = (s: string | null | undefined): number => {
  const v = s ? Date.parse(s) : Number.NaN
  return Number.isNaN(v) ? Number.NaN : v
}

/** Instante del último contacto para ordenar: sin contacto = el más viejo posible; error = al final. */
function ultimoParaOrdenar(f: FilaComun): number {
  if (f.ultimoContacto === 'error') return Number.POSITIVE_INFINITY
  if (!f.ultimoContacto) return Number.NEGATIVE_INFINITY
  const v = ms(f.ultimoContacto.at)
  return Number.isNaN(v) ? Number.NEGATIVE_INFINITY : v
}

/** Rango del próximo paso: 0 con fecha (por instante), 1 sin fecha, 2 sin nada, 3 sin dato. */
function rangoProximo(f: FilaComun): number {
  if (f.proximo === 'error') return 3
  if (!f.proximo) return 2
  return f.proximo.instante ? 0 : 1
}

function compararProximo(a: FilaComun, b: FilaComun): number {
  const ra = rangoProximo(a)
  const rb = rangoProximo(b)
  if (ra !== rb) return ra - rb
  if (ra === 0 && a.proximo && a.proximo !== 'error' && b.proximo && b.proximo !== 'error') {
    const d = ms(a.proximo.instante) - ms(b.proximo.instante)
    if (d) return d
  }
  // Mismo vencimiento: primero el que lleva más tiempo sin contacto; entre dos sin ningún
  // contacto, el que entró antes (así las solicitudes viejas quedan de la más vieja a la nueva).
  const u = ultimoParaOrdenar(a) - ultimoParaOrdenar(b)
  if (u && !Number.isNaN(u)) return u
  return ms(a.creadoEn) - ms(b.creadoEn) || a.id.localeCompare(b.id)
}

const COMPARAR: Record<FiltrosCartera['orden'], (a: FilaComun, b: FilaComun) => number> = {
  proximo: compararProximo,
  ultimo: (a, b) => ultimoParaOrdenar(a) - ultimoParaOrdenar(b) || ms(a.creadoEn) - ms(b.creadoEn) || a.id.localeCompare(b.id),
  nuevos: (a, b) => ms(b.creadoEn) - ms(a.creadoEn) || a.id.localeCompare(b.id),
  nombre: (a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }) || a.nombre.localeCompare(b.nombre, 'es') || a.id.localeCompare(b.id),
}

/** Devuelve una lista nueva: no toca la que recibe. */
export function ordenarFilas<T extends FilaComun>(f: T[], orden: FiltrosCartera['orden']): T[] {
  return [...f].sort(COMPARAR[orden] ?? compararProximo)
}

function proximoVencido(f: FilaCartera, ahora: Date): boolean {
  return !!f.proximo && f.proximo !== 'error' && vencimientoDeTarea(f.proximo.vence, ahora).vencida
}

function tasacionFutura(f: FilaCartera, ahora: Date, dias: number[]): boolean {
  if (!f.tasacion) return false
  if (ms(f.tasacion.instante) <= ahora.getTime()) return false
  let d: number
  try {
    d = diasDeCalendarioEntre(ahora, instanteDesdeAR(f.tasacion.fecha, '12:00'))
  } catch {
    return false
  }
  return dias.includes(d)
}

const porTasacion = (a: FilaCartera, b: FilaCartera) => ms(a.tasacion?.instante) - ms(b.tasacion?.instante) || a.id.localeCompare(b.id)

/**
 * Los grupos de cada vista, en su orden, con cada proceso solo en el PRIMERO que le toca y
 * sin grupos vacíos. Las filas cerradas van a un único grupo "cerrados" (del cierre más
 * reciente al más viejo). Si una fuente falló, la fila trae 'error' y no entra en los
 * grupos que dependen de ese dato: con el último contacto en error nadie está "sin primer
 * contacto"; con las tareas en error no hay vencidas ni "Con próximo paso" (las tasaciones
 * sí, salen del proceso), y en la vista del asesor el resto queda en una lista neutra
 * ("todos"): "Sin nada pendiente" afirmaría algo que no se sabe.
 */
export function agrupar(f: FilaCartera[], v: Vista, ahora: Date): Grupo[] {
  const abiertos = f.filter((x) => x.abierto)
  const cerrados = f.filter((x) => !x.abierto)
  const grupos: Grupo[] = []
  let quedan = abiertos
  const tomar = (clave: ClaveGrupo, cumple: (x: FilaCartera) => boolean, orden: (a: FilaCartera, b: FilaCartera) => number, urgente = false) => {
    const filas = quedan.filter(cumple).sort(orden)
    quedan = quedan.filter((x) => !cumple(x))
    if (filas.length > 0) grupos.push({ clave, filas, urgente })
  }

  if (v.tipo === 'coordinacion') {
    tomar('sin-contacto', sinPrimerContacto, (a, b) => ms(a.creadoEn) - ms(b.creadoEn) || a.id.localeCompare(b.id), true)
    // La tasación pasada es tarea del asesor: no cuenta como llamada vencida de la coordinación.
    tomar('vencidas', (x) => proximoVencido(x, ahora) && x.proximo !== 'error' && x.proximo?.clase === 'tarea', compararProximo, true)
    tomar('tasaciones', (x) => tasacionFutura(x, ahora, [0, 1]), porTasacion)
    tomar('resto', () => true, compararProximo)
  } else if (v.tipo === 'asesor') {
    tomar('hoy', (x) => tasacionFutura(x, ahora, [0]), porTasacion)
    tomar('vencidas', (x) => proximoVencido(x, ahora), compararProximo, true)
    tomar('proximos', (x) => !!x.proximo && x.proximo !== 'error', compararProximo)
    tomar('nada', (x) => x.proximo === null, compararProximo)
    tomar('todos', () => true, compararProximo)
  } else {
    tomar('todos', () => true, compararProximo)
  }

  if (cerrados.length > 0) {
    const sinCierre = Number.NEGATIVE_INFINITY
    const cierre = (x: FilaCartera) => (Number.isNaN(ms(x.cerradoEn)) ? sinCierre : ms(x.cerradoEn))
    grupos.push({
      clave: 'cerrados',
      filas: [...cerrados].sort((a, b) => cierre(b) - cierre(a) || a.id.localeCompare(b.id)),
      urgente: false,
    })
  }
  return grupos
}
