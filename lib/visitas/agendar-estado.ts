/**
 * Estado de la ventana "Agendar visita" (spec §3.2). Puro: la ventana solo
 * despacha acciones y pinta; las reglas de cada paso viven acá, testeadas.
 * El servidor vuelve a validar TODO (esto es ayuda, no barrera).
 */
import { ORIGEN_INFO, validarDetalleDeOrigen, type OrigenVisita } from './origen'
import { construirInstante, formatearDiaYNumero, validarHorarioDeVisita } from './horario'
import { validarPersonaNueva } from './persona'
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'

export type PasoAgendar = 'propiedad' | 'origen' | 'persona' | 'cuando' | 'asesor' | 'confirmar'
const ORDEN: PasoAgendar[] = ['propiedad', 'origen', 'persona', 'cuando', 'asesor', 'confirmar']

export interface PropiedadElegida {
  id: string
  address: string
  neighborhood: string | null
  foto: string | null
  asesorId: string | null
}

export type PersonaElegida =
  | { tipo: 'consulta' | 'registro'; id: string; nombre: string; telefono: string | null; detalle: string }
  | { tipo: 'nueva'; nombre: string; telefono: string; email: string }

export interface EstadoAgendar {
  paso: PasoAgendar
  propiedadFija: boolean
  propiedad: PropiedadElegida | null
  origen: OrigenVisita | null
  origenDetalle: string
  persona: PersonaElegida | null
  telefonoFaltante: string
  fecha: string | null
  hora: string | null
  asesorId: string | null
  confirmada: boolean
  notas: string
  /**
   * Modo rápido: se abrió desde una consulta que ya dice quién es, de dónde
   * vino y qué propiedad miró. Solo queda elegir día y hora.
   */
  rapido: boolean
  /**
   * Solo en modo rápido: el teléfono como lo leyó el llamador. Lo calcula quien
   * abre la ventana (con `leerTelefono`): la ventana no lee teléfonos por su
   * cuenta, recibe el resultado ya decidido. (No es para dejar libphonenumber
   * fuera del bundle: este módulo lo importa igual vía `./persona`.) `null`
   * fuera del modo rápido.
   */
  telefonoRapido: { mostrado: string | null; valido: boolean } | null
  /**
   * Se pidió el modo rápido pero la propiedad de la consulta no se pudo cargar
   * (no está disponible, o un asesor abrió una que no es suya). NO se cae al
   * flujo normal: ahí se podía elegir otra propiedad u otra persona y, al
   * terminar, la hoja "Listo" de Consultas mostraba la dirección y el teléfono
   * de la CONSULTA, no lo que se agendó. La ventana solo avisa y deja cerrar.
   */
  rapidoBloqueado: boolean
}

export interface OpcionesPasos { puedeElegirAsesor: boolean }

export const ERROR_TELEFONO_RAPIDO = 'El teléfono de esta persona no sirve para WhatsApp. Corregilo desde la consulta.'

/**
 * Lo que trae quien abre la ventana desde una consulta (sección Consultas).
 * El origen lo decide el llamador (para un registro de landing, con
 * `origenDesdeLead`); acá se toma tal cual.
 */
export interface InicioRapido {
  origen: OrigenVisita
  origenDetalle?: string
  persona: PersonaElegida
  /**
   * Teléfono canónico ya revisado (la hoja "revisar teléfono" de Consultas corre
   * ANTES de abrir la ventana); va a `telefonoFaltante` y viaja en el pedido.
   */
  telefono?: string
  /** `leerTelefono(rapido.telefono ?? persona.telefono).mostrado` si se pudo leer; si no, `null`. */
  telefonoMostrado: string | null
  /** `leerTelefono(...).ok`. Si es `false`, el botón rápido no manda (la ventana no corrige teléfonos). */
  telefonoValido: boolean
}

/**
 * Freno del modo rápido: la ventana ya no tiene paso "Persona" para corregir
 * el teléfono, así que si el llamador lo marcó como inválido no se manda.
 * Usa la lectura completa (`leerTelefono`) del llamador, no `ultimos10Digitos`:
 * un número de 10 o más dígitos igual puede ser inválido.
 */
export function errorTelefonoRapido(e: EstadoAgendar): string | null {
  return e.rapido && e.telefonoRapido && !e.telefonoRapido.valido ? ERROR_TELEFONO_RAPIDO : null
}

export function estadoInicial(o: {
  propiedad?: PropiedadElegida | null
  asesorPropio?: string | null
  rapido?: InicioRapido | null
}): EstadoAgendar {
  const propiedad = o.propiedad ?? null
  // Sin propiedad no hay modo rápido; si se lo pidió, la ventana queda
  // bloqueada (ver `rapidoBloqueado`) en vez de arrancar el flujo normal.
  const rapido = propiedad ? o.rapido ?? null : null
  return {
    paso: rapido ? 'cuando' : propiedad ? 'origen' : 'propiedad',
    propiedadFija: propiedad !== null,
    propiedad,
    origen: rapido?.origen ?? null,
    origenDetalle: rapido?.origenDetalle ?? '',
    persona: rapido?.persona ?? null,
    telefonoFaltante: rapido?.telefono ?? '',
    fecha: null,
    hora: null,
    asesorId: propiedad?.asesorId ?? o.asesorPropio ?? null,
    confirmada: true,
    notas: '',
    rapido: rapido !== null,
    telefonoRapido: rapido ? { mostrado: rapido.telefonoMostrado, valido: rapido.telefonoValido } : null,
    rapidoBloqueado: propiedad === null && o.rapido != null,
  }
}

export function pasosVisibles(e: EstadoAgendar, o: OpcionesPasos): PasoAgendar[] {
  // Bloqueada: no hay ningún paso para recorrer, solo el aviso y "Cerrar".
  if (e.rapidoBloqueado) return []
  // En modo rápido solo existe "cuándo". "Asesor" aparece mientras se está en
  // él (se llega con "Cambiar") y "Confirmar" solo cuando el servidor avisó un
  // duplicado (409): ahí se muestra la revisión con "Agendar igual".
  if (e.rapido) {
    return ORDEN.filter(p => p === 'cuando'
      || (p === 'asesor' && e.paso === 'asesor' && o.puedeElegirAsesor)
      || (p === 'confirmar' && e.paso === 'confirmar'))
  }
  return ORDEN.filter(p => !(p === 'propiedad' && e.propiedadFija) && !(p === 'asesor' && !o.puedeElegirAsesor))
}

/** "Agendar jueves 30 · 17:00" con día y hora válidos; "Agendar" si falta algo. */
export function textoAgendarRapido(e: EstadoAgendar): string {
  if (!e.fecha || !e.hora || !construirInstante(e.fecha, e.hora)) return 'Agendar'
  const dia = formatearDiaYNumero(e.fecha)
  return dia ? `Agendar ${dia} · ${e.hora}` : 'Agendar'
}

export function siguientePaso(e: EstadoAgendar, o: OpcionesPasos): PasoAgendar | null {
  const pasos = pasosVisibles(e, o)
  return pasos[pasos.indexOf(e.paso) + 1] ?? null
}

export function pasoAnterior(e: EstadoAgendar, o: OpcionesPasos): PasoAgendar | null {
  const pasos = pasosVisibles(e, o)
  const i = pasos.indexOf(e.paso)
  return i > 0 ? pasos[i - 1] : null
}

export type AccionAgendar =
  | { tipo: 'reiniciar'; estado: EstadoAgendar }
  | { tipo: 'irA'; paso: PasoAgendar }
  | { tipo: 'elegirPropiedad'; propiedad: PropiedadElegida }
  | { tipo: 'elegirOrigen'; origen: OrigenVisita }
  | { tipo: 'detalleOrigen'; texto: string }
  | { tipo: 'elegirPersona'; persona: PersonaElegida | null }
  | { tipo: 'telefonoFaltante'; texto: string }
  | { tipo: 'elegirFecha'; fecha: string }
  | { tipo: 'elegirHora'; hora: string }
  | { tipo: 'elegirAsesor'; asesorId: string }
  | { tipo: 'confirmada'; valor: boolean }
  | { tipo: 'notas'; texto: string }

export function reducirAgendar(e: EstadoAgendar, a: AccionAgendar): EstadoAgendar {
  switch (a.tipo) {
    case 'reiniciar': return a.estado
    case 'irA': return { ...e, paso: a.paso }
    case 'elegirPropiedad':
      return { ...e, propiedad: a.propiedad, persona: null, telefonoFaltante: '', asesorId: a.propiedad.asesorId ?? e.asesorId }
    case 'elegirOrigen':
      return a.origen === e.origen ? e : { ...e, origen: a.origen, origenDetalle: '', persona: null, telefonoFaltante: '' }
    case 'detalleOrigen': return { ...e, origenDetalle: a.texto }
    case 'elegirPersona': return { ...e, persona: a.persona, telefonoFaltante: '' }
    case 'telefonoFaltante': return { ...e, telefonoFaltante: a.texto }
    case 'elegirFecha': return { ...e, fecha: a.fecha }
    case 'elegirHora': return { ...e, hora: a.hora }
    case 'elegirAsesor': return { ...e, asesorId: a.asesorId }
    case 'confirmada': return { ...e, confirmada: a.valor }
    case 'notas': return { ...e, notas: a.texto }
  }
}

export function errorDelPaso(e: EstadoAgendar, paso: PasoAgendar, ahora: Date = new Date()): string | null {
  switch (paso) {
    case 'propiedad':
      return e.propiedad ? null : 'Elegí la propiedad'
    case 'origen': {
      if (!e.origen) return 'Elegí de dónde viene la visita'
      if (ORIGEN_INFO[e.origen].detalle === 'no') return null
      const d = validarDetalleDeOrigen(e.origen, e.origenDetalle)
      return d.ok ? null : d.error
    }
    case 'persona': {
      if (!e.persona) return 'Elegí a la persona o cargala a mano'
      if (e.persona.tipo === 'nueva') {
        const p = validarPersonaNueva(e.persona)
        return p.ok ? null : p.errores[0]
      }
      // El teléfono guardado de la persona elegida en la lista solo cuenta si
      // es utilizable (10 dígitos o más); un valor corto ('123', restos de
      // carga vieja) no alcanza y exige completar `telefonoFaltante`.
      if (ultimos10Digitos(e.persona.telefono) || ultimos10Digitos(e.telefonoFaltante)) return null
      return 'Falta el teléfono de la persona'
    }
    case 'cuando': {
      if (!e.fecha || !e.hora) return 'Elegí el día y la hora'
      const h = validarHorarioDeVisita(e.fecha, e.hora, ahora)
      return h.ok ? null : h.error
    }
    case 'asesor':
      return e.asesorId ? null : 'Elegí el asesor'
    case 'confirmar':
      return null
  }
}

export interface PedidoAlta {
  propiedadId: string
  origen: OrigenVisita
  origenDetalle: string | null
  persona: { tipo: 'consulta' | 'registro'; id: string; telefono?: string } | { tipo: 'nueva'; nombre: string; telefono: string; email: string | null }
  fecha: string
  hora: string
  asesorId: string | null
  confirmada: boolean
  notas: string | null
  forzarDuplicado?: boolean
}

export function armarPedido(e: EstadoAgendar): PedidoAlta | null {
  if (!e.propiedad || !e.origen || !e.persona || !e.fecha || !e.hora) return null
  const persona: PedidoAlta['persona'] = e.persona.tipo === 'nueva'
    ? { tipo: 'nueva', nombre: e.persona.nombre, telefono: e.persona.telefono, email: e.persona.email.trim() || null }
    : { tipo: e.persona.tipo, id: e.persona.id, ...(e.telefonoFaltante.trim() ? { telefono: e.telefonoFaltante.trim() } : {}) }
  return {
    propiedadId: e.propiedad.id,
    origen: e.origen,
    origenDetalle: e.origenDetalle.trim() || null,
    persona,
    fecha: e.fecha,
    hora: e.hora,
    asesorId: e.asesorId,
    confirmada: e.confirmada,
    notas: e.notas.trim() || null,
  }
}
