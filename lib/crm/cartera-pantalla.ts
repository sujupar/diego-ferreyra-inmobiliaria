// Qué escribe cada dato de la fila de la cartera y qué piezas tiene cada vista
// (crm-cartera-por-rol, design.md D5 y D8). Puro: los componentes de `components/crm/cartera`
// solo DIBUJAN lo que devuelve esto, así la fila del CRM, la de Contactos y la sonda de
// render (`scripts/cartera.probe.tsx`) dicen exactamente lo mismo de la misma persona.
import { sinAsesor, sinMovimiento, type FilaComun, type FiltrosCartera } from './cartera'
import { ETAPAS_EMBUDO, ETAPAS_FUERA_DEL_EMBUDO, NOMBRE_ETAPA, type EtapaCRM } from './etapas'
import { diaCorto, fechaExacta, haceCuanto, horaCorta, textoVencimiento, type EstadoVencimiento } from './formato-fecha'
import { diasDeCalendarioEntre, enArgentina, instanteDesdeAR } from './horario-laboral'
import { INICIO_REGISTRO_CONTACTOS, textoQueFue } from './ultimo-contacto'

export const NOMBRE_ORIGEN: Record<string, string> = {
  embudo: 'Embudo',
  referido: 'Referido',
  historico: 'Histórico',
  clase_gratuita: 'Clase gratuita',
}

export const NOMBRE_TRABADO: Record<Exclude<FiltrosCartera['trabado'], ''>, string> = {
  'sin-contacto': 'Sin primer contacto',
  'sin-asesor': 'Sin asesor',
  'sin-movimiento': 'Seguimiento sin movimiento',
}

/** Opciones de "Entró al CRM" / "Se registró" (spec "Opciones de los filtros"). */
export const PERIODOS: { valor: Exclude<FiltrosCartera['entro'], 'rango'>; etiqueta: string }[] = [
  { valor: '', etiqueta: 'Cualquier fecha' },
  { valor: 'hoy', etiqueta: 'Hoy' },
  { valor: 'ayer', etiqueta: 'Ayer' },
  { valor: '7', etiqueta: 'Últimos 7 días' },
  { valor: '15', etiqueta: 'Últimos 15 días' },
  { valor: '30', etiqueta: 'Últimos 30 días' },
  { valor: '90', etiqueta: 'Últimos 90 días' },
]

export const ORDENES: { valor: FiltrosCartera['orden']; etiqueta: string }[] = [
  { valor: 'proximo', etiqueta: 'Próximo paso' },
  { valor: 'ultimo', etiqueta: 'Más tiempo sin contacto' },
  { valor: 'nuevos', etiqueta: 'Más nuevos primero' },
  { valor: 'nombre', etiqueta: 'Nombre (A a Z)' },
]

/** Lo que saca "Limpiar filtros": todo lo que filtra; segmento, orden, colegas y "Ver como" quedan. */
export const SIN_FILTROS: Pick<FiltrosCartera, 'etapa' | 'origen' | 'asesor' | 'entro' | 'desde' | 'hasta' | 'q' | 'trabado'> = {
  etapa: '',
  origen: '',
  asesor: '',
  entro: '',
  desde: '',
  hasta: '',
  q: '',
  trabado: '',
}

/** "3.000": separador de miles con punto, sin depender del idioma del navegador. */
export function miles(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

// ── Último contacto ──────────────────────────────────────────────────────────────────────

export type DatoUltimo =
  | { tipo: 'error' }
  | { tipo: 'nada'; texto: string; alerta: boolean; sub: string | null }
  // `sub` = el renglón entero; `que` = solo qué fue (la pantalla pinta "Sin movimiento" en rojo aparte).
  | { tipo: 'dato'; principal: string; exacta: string; sub: string; que: string; alerta: boolean }

function frio(f: FilaComun, ahora: Date): boolean {
  return f.etapa !== null && sinMovimiento({ abierto: f.abierto, etapa: f.etapa, ultimoContacto: f.ultimoContacto }, ahora)
}

/**
 * Spec "Último contacto". "Sin movimiento" usa la MISMA regla que "Lo que está trabado"
 * (`sinMovimiento`), y va con texto e ícono además del rojo. Un contacto de antes del
 * registro de llamadas lo dice ("antes del registro de llamadas"): no se sabe si después
 * alguien llamó sin anotarlo.
 */
export function datoUltimoContacto(f: FilaComun, ahora: Date): DatoUltimo {
  if (f.ultimoContacto === 'error') return { tipo: 'error' }
  const alerta = frio(f, ahora)
  if (!f.ultimoContacto) {
    if (!f.abierto) return { tipo: 'nada', texto: '—', alerta: false, sub: null }
    return {
      tipo: 'nada',
      texto: f.anteriorAlRegistro ? 'Sin contacto registrado' : 'Sin contacto todavía',
      alerta,
      sub: alerta ? 'Sin movimiento' : null,
    }
  }
  const at = new Date(f.ultimoContacto.at)
  const antes = !Number.isNaN(at.getTime()) && enArgentina(at).fecha < INICIO_REGISTRO_CONTACTOS
  const que = textoQueFue(f.ultimoContacto) + (antes ? ' · antes del registro de llamadas' : '')
  return {
    tipo: 'dato',
    principal: haceCuanto(f.ultimoContacto.at, ahora),
    exacta: fechaExacta(f.ultimoContacto.at),
    sub: alerta ? `Sin movimiento · ${que}` : que,
    que,
    alerta,
  }
}

// ── Próximo paso ─────────────────────────────────────────────────────────────────────────

export type IconoVencimiento = 'alerta' | 'reloj' | 'calendario' | 'ninguno'

export type DatoProximo =
  | { tipo: 'error' }
  | { tipo: 'nada'; texto: string }
  | { tipo: 'cierre'; texto: string }
  | { tipo: 'paso'; titulo: string; cuando: string; estado: EstadoVencimiento; icono: IconoVencimiento; quien: string | null }

/**
 * Spec "Próximo paso" y "Columna Cierre". El vencimiento siempre lleva texto e ícono además
 * del color (spec del sistema de diseño). Un proceso cerrado muestra su cierre aunque le
 * quede una tarea colgada; una persona sin proceso (Contactos) muestra su tarea o "—".
 */
export function datoProximo(f: FilaComun, ahora: Date): DatoProximo {
  if (f.etapa !== null && !f.abierto) {
    const nombre = NOMBRE_ETAPA[f.etapa]
    return { tipo: 'cierre', texto: f.cerradoEn ? `${nombre} ${haceCuanto(f.cerradoEn, ahora)}` : nombre }
  }
  if (f.proximo === 'error') return { tipo: 'error' }
  if (!f.proximo) return { tipo: 'nada', texto: f.etapa === null ? '—' : 'Nada agendado' }
  const p = f.proximo
  const { texto, estado } = textoVencimiento(p.vence, ahora, {
    todoElDia: p.vence.all_day,
    espera: p.espera ?? undefined,
  })
  const icono: IconoVencimiento =
    estado === 'vencida'
      ? p.espera
        ? 'reloj'
        : 'alerta'
      : estado === 'hoy'
        ? p.clase === 'tasacion'
          ? 'calendario'
          : 'reloj'
        : estado === 'proxima'
          ? 'calendario'
          : 'ninguno'
  return { tipo: 'paso', titulo: p.titulo, cuando: texto, estado, icono, quien: p.quien?.nombre ?? null }
}

// ── Asesor ───────────────────────────────────────────────────────────────────────────────

export type DatoAsesor = { tipo: 'nombre'; texto: string; baja: boolean } | { tipo: 'sin' } | { tipo: 'vacio' }

/** Spec "Columna Asesor": "Sin asesor" solo cuando le corresponde uno (la misma regla de lo trabado). */
export function datoAsesor(f: FilaComun): DatoAsesor {
  if (f.asesor) {
    return f.asesor.activo
      ? { tipo: 'nombre', texto: f.asesor.nombre, baja: false }
      : { tipo: 'nombre', texto: `${f.asesor.nombre} (dado de baja)`, baja: true }
  }
  return sinAsesor(f) ? { tipo: 'sin' } : { tipo: 'vacio' }
}

// ── Renglones de la persona ──────────────────────────────────────────────────────────────

/**
 * El tercer renglón "Tasación mañana 11:00" (spec "Tasación cercana en la fila"): solo para
 * hoy o mañana, si todavía no pasó y si no es ya el próximo paso. "con {asesor}" solo donde
 * no hay columna Asesor, y la dirección solo si es otra.
 */
export function lineaTasacion(f: FilaComun, o: { conAsesor: boolean }, ahora: Date): string | null {
  const t = f.tasacion
  if (!t) return null
  if (f.proximo && f.proximo !== 'error' && f.proximo.clase === 'tasacion') return null
  const instante = Date.parse(t.instante)
  if (Number.isNaN(instante) || instante <= ahora.getTime()) return null
  let dias: number
  try {
    dias = diasDeCalendarioEntre(ahora, instanteDesdeAR(t.fecha, '12:00'))
  } catch {
    return null
  }
  if (dias !== 0 && dias !== 1) return null
  const cuando = textoVencimiento({ due_date: t.fecha, due_time: t.hora }, ahora, { todoElDia: !t.hora }).texto
  const conQuien = !o.conAsesor && t.asesor ? ` con ${t.asesor}` : ''
  const otraDireccion = t.direccion && t.direccion.trim() && t.direccion.trim() !== f.direccion ? ` · ${t.direccion.trim()}` : ''
  return `Tasación ${cuando.charAt(0).toLowerCase()}${cuando.slice(1)}${conQuien}${otraDireccion}`
}

/** Renglón debajo del nombre: propiedad y dirección (CRM) o teléfono y propiedad (Contactos). */
export function subtituloDeFila(f: FilaComun, lista: 'cartera' | 'contactos'): string {
  const partes = lista === 'cartera' ? [f.propiedad, f.direccion] : [f.telefono, f.propiedad || f.direccion]
  return partes.filter((x): x is string => !!x && !!x.trim()).join(' · ')
}

/**
 * A dónde lleva la fila: la ficha de la persona, con la vuelta a esta lista codificada (la
 * ficha la valida con `enlaceVolver`); un proceso sin contacto, su pantalla.
 */
export function hrefDeFila(f: Pick<FilaComun, 'id' | 'contactoId'>, volver: string): string {
  if (!f.contactoId) return `/pipeline/${encodeURIComponent(f.id)}`
  return `/contacts/${encodeURIComponent(f.contactoId)}?volver=${encodeURIComponent(volver)}`
}

// ── Barra de etapas ──────────────────────────────────────────────────────────────────────

export interface GrupoDeEtapas {
  base: string
  etapas: EtapaCRM[]
}

/**
 * Las etapas de la barra de cada vista (spec "Barra de etapas de cada vista"). Al asesor se
 * le suman Solicitud o Clase gratuita SOLO si tiene alguna (Diferencias, 11): `totales` son
 * los de la vista entera, sin filtros, así la barra no cambia de forma al filtrar.
 */
export function etapasDeVista(
  tipo: 'coordinacion' | 'asesor' | 'dueno',
  seg: FiltrosCartera['seg'],
  totales: Record<EtapaCRM, number>,
): GrupoDeEtapas[] {
  if (seg === 'cerrados') return [{ base: 'Por etapa', etapas: tipo === 'coordinacion' ? ['descartado'] : ['captada', 'descartado'] }]
  if (tipo === 'coordinacion') return [{ base: 'Por etapa', etapas: ['solicitud', 'coordinada', 'no_realizada'] }]
  if (tipo === 'asesor') {
    const etapas: EtapaCRM[] = [
      ...(totales.solicitud > 0 ? (['solicitud'] as const) : []),
      'coordinada', 'no_realizada', 'realizada', 'entregada', 'seguimiento',
      ...(totales.clase_gratuita > 0 ? (['clase_gratuita'] as const) : []),
      'comprador',
    ]
    return [{ base: 'Por etapa', etapas }]
  }
  return [
    { base: 'Embudo de tasación', etapas: [...ETAPAS_EMBUDO] },
    { base: 'Fuera del embudo', etapas: [...ETAPAS_FUERA_DEL_EMBUDO] },
  ]
}

// ── Filtros puestos ──────────────────────────────────────────────────────────────────────

export type ClaveFicha = 'q' | 'trabado' | 'etapa' | 'origen' | 'asesor' | 'entro'

/** Qué saca la cruz de cada ficha: "Entró" se lleva también las dos fechas del rango. */
export const SACAR_FICHA: Record<ClaveFicha, Partial<FiltrosCartera>> = {
  q: { q: '' },
  trabado: { trabado: '' },
  etapa: { etapa: '' },
  origen: { origen: '' },
  asesor: { asesor: '' },
  entro: { entro: '', desde: '', hasta: '' },
}

const dd_mm = (f: string) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : '…')

/** "Del 01/11 al 25/11" (una punta vacía se escribe "…"). */
export function etiquetaRango(desde: string, hasta: string): string {
  return `Del ${dd_mm(desde)} al ${dd_mm(hasta)}`
}

/** Las fichas de los filtros puestos, en el orden de la maqueta (`chipsActivos`). */
export function fichasActivas(
  f: FiltrosCartera,
  o: { asesores: { id: string; nombre: string; activo: boolean }[]; lista: 'crm' | 'contactos' },
): { clave: ClaveFicha; texto: string }[] {
  const fichas: { clave: ClaveFicha; texto: string }[] = []
  if (f.q) fichas.push({ clave: 'q', texto: `Busca: «${f.q}»` })
  if (f.trabado) fichas.push({ clave: 'trabado', texto: NOMBRE_TRABADO[f.trabado] })
  if (f.etapa) fichas.push({ clave: 'etapa', texto: `Etapa: ${NOMBRE_ETAPA[f.etapa]}` })
  if (f.origen) fichas.push({ clave: 'origen', texto: `Origen: ${NOMBRE_ORIGEN[f.origen]}` })
  if (f.asesor) {
    const a = o.asesores.find((x) => x.id === f.asesor)
    const nombre = f.asesor === 'sin' ? 'sin asesor' : a ? (a.activo ? a.nombre : `${a.nombre} (dado de baja)`) : 'otra persona'
    fichas.push({ clave: 'asesor', texto: `Asesor: ${nombre}` })
  }
  if (f.entro) {
    const prefijo = o.lista === 'crm' ? 'Entró' : 'Se registró'
    const cuando =
      f.entro === 'rango' ? etiquetaRango(f.desde, f.hasta) : (PERIODOS.find((p) => p.valor === f.entro)?.etiqueta ?? '').toLowerCase()
    fichas.push({ clave: 'entro', texto: `${prefijo}: ${cuando}` })
  }
  return fichas
}

/** El número del botón "Filtros" del celular: sin contar la búsqueda, que está a la vista. */
export function cuantosFiltros(f: FiltrosCartera): number {
  return [f.etapa, f.origen, f.asesor, f.entro, f.trabado].filter(Boolean).length
}

/** ¿Hay algo que "Limpiar filtros" sacaría? (decide el vacío "Ningún … coincide"). */
export function hayFiltros(f: FiltrosCartera): boolean {
  return cuantosFiltros(f) > 0 || !!f.q
}

// ── Textos con números ───────────────────────────────────────────────────────────────────

/**
 * "Mostrando X de Y procesos abiertos". Si la lectura llegó al tope, Y no es el total real
 * y la frase no puede decir que lo es (spec "Más que el tope").
 */
export function textoPie(mostrados: number, total: number, unidad: 'abiertos' | 'cerrados' | 'personas', truncado: boolean): string {
  const cosa = unidad === 'personas' ? 'personas' : `procesos ${unidad}`
  if (truncado) return `Mostrando ${miles(mostrados)} de los ${miles(total)} ${cosa} que se pudieron traer`
  return `Mostrando ${miles(mostrados)} de ${miles(total)} ${cosa}`
}

/** "al mié 25 nov, 10:40": cuándo se contó lo trabado, en hora de Argentina. */
export function momentoDelCalculo(ahora: Date): string {
  const ar = enArgentina(ahora)
  return `al ${diaCorto(ar.fecha)}, ${horaCorta(ar.hora)}`
}

export function textoBotonTrabado(n: number, activo: boolean): string {
  if (activo) return 'Quitar este filtro'
  return n === 1 ? 'Ver el proceso en la lista' : `Ver los ${miles(n)} en la lista`
}

/** "Realizada · Histórico" (spec "Sin asesor"). */
export function detalleSinAsesor(f: Pick<FilaComun, 'etapa' | 'origen'>): string {
  return [f.etapa ? NOMBRE_ETAPA[f.etapa] : null, f.origen ? (NOMBRE_ORIGEN[f.origen] ?? null) : null].filter(Boolean).join(' · ')
}
