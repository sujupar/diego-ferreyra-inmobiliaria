/**
 * Estado de la ventana "Agendar visita" (spec §3.2). Puro: la ventana solo
 * despacha acciones y pinta; las reglas de cada paso viven acá, testeadas.
 * El servidor vuelve a validar TODO (esto es ayuda, no barrera).
 */
import { ORIGEN_INFO, validarDetalleDeOrigen, type OrigenVisita } from './origen'
import { validarHorarioDeVisita } from './horario'
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
}

export interface OpcionesPasos { puedeElegirAsesor: boolean }

export function estadoInicial(o: { propiedad?: PropiedadElegida | null; asesorPropio?: string | null }): EstadoAgendar {
  const propiedad = o.propiedad ?? null
  return {
    paso: propiedad ? 'origen' : 'propiedad',
    propiedadFija: propiedad !== null,
    propiedad,
    origen: null,
    origenDetalle: '',
    persona: null,
    telefonoFaltante: '',
    fecha: null,
    hora: null,
    asesorId: propiedad?.asesorId ?? o.asesorPropio ?? null,
    confirmada: true,
    notas: '',
  }
}

export function pasosVisibles(e: EstadoAgendar, o: OpcionesPasos): PasoAgendar[] {
  return ORDEN.filter(p => !(p === 'propiedad' && e.propiedadFija) && !(p === 'asesor' && !o.puedeElegirAsesor))
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
