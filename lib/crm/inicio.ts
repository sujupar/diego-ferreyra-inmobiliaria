// Reglas del Inicio (crm-inicio, D1). Puro: trabaja sobre las filas de la cartera (las MISMAS
// reglas que el CRM) y datos chicos, y devuelve los textos listos para dibujar.

import { RESULTADO_CORTO } from './actividades'
import { estadoCadencia, type IntentoDeCadencia } from './cadencia'
import { sinPrimerContacto, type FilaCartera } from './cartera'
import { textoEspera } from './cartera-trabado'
import { NOMBRE_ETAPA, type EtapaCRM } from './etapas'
import { diaCorto, duracion, fechaRelativa, haceCuanto, textoVencimiento } from './formato-fecha'
import { diasDeCalendarioEntre, enArgentina, instanteDesdeAR, minutosHabilesEntre } from './horario-laboral'
import { INICIO_REGISTRO_CONTACTOS } from './ultimo-contacto'
import type { TareaDeAgenda } from '@/lib/supabase/agenda-tareas'

const ES_LLAMADA = /^(Primera llamada|Llamada \d+)$/

/** "18 nov" (la maqueta, en "Se registró 18 nov"). */
function diaYMes(iso: string): string {
  return diaCorto(enArgentina(new Date(iso)).fecha).replace(/^\S+\s/, '')
}

type Proximo = Exclude<FilaCartera['proximo'], null | 'error'>
const proximoDe = (f: FilaCartera): Proximo | null => (f.proximo && f.proximo !== 'error' ? f.proximo : null)
const ultimoDe = (f: FilaCartera) => (f.ultimoContacto && f.ultimoContacto !== 'error' ? f.ultimoContacto : null)

export interface PersonaDelInicio {
  procesoId: string
  contactoId: string | null
  nombre: string
  telefono: string | null
  propiedad: string
}

const persona = (f: FilaCartera): PersonaDelInicio => ({
  procesoId: f.id,
  contactoId: f.contactoId,
  nombre: f.nombre,
  telefono: f.telefono,
  propiedad: f.propiedad,
})

// ── Para llamar ahora ───────────────────────────────────────────────

export interface ItemParaLlamar extends PersonaDelInicio {
  llamada: string
  registrado: string
  estado: { texto: string; tipo: 'espera' | 'vencida' | 'proxima' }
  anterior: string | null
}

/** Las etapas que lleva la coordinación (la cola no incluye clases, compradores ni cerrados). */
const ETAPAS_COORDINACION: readonly string[] = ['solicitud', 'coordinada', 'no_realizada']
const deCoordinacion = (f: FilaCartera) => f.abierto && !f.colega && ETAPAS_COORDINACION.includes(f.etapa)

/**
 * La cola única de la coordinación (spec "Para llamar ahora"; auditoría de artefactos 1, 4,
 * 5): las solicitudes desde el registro sin primer contacto, y las personas con una tarea de
 * llamada de CUALQUIER coordinadora ya vencida (también las de antes del registro y las de
 * "Volver a llamar"). Una vez por persona, de la más vieja a la más nueva.
 * `tareasCoordinacion`: las tareas pendientes de todas las coordinadoras (`leerAgenda`).
 * `llamadas`: cuántas llamadas sin anular tiene cada proceso ("Llamada N" = N - 1 + 1).
 */
export function colaParaLlamar(
  filas: readonly FilaCartera[],
  tareasCoordinacion: readonly TareaDeAgenda[],
  llamadas: ReadonlyMap<string, number>,
  ahora: Date,
): ItemParaLlamar[] {
  const porProceso = new Map(filas.map((f) => [f.id, f]))
  const porContacto = new Map<string, FilaCartera>()
  for (const f of filas) if (f.contactoId && deCoordinacion(f) && !porContacto.has(f.contactoId)) porContacto.set(f.contactoId, f)
  const tareaDe = new Map<string, TareaDeAgenda>() // la llamada más vencida de cada proceso
  const elegidas = new Map<string, FilaCartera>() // por proceso
  for (const t of tareasCoordinacion) {
    if (t.tipo !== 'llamada') continue
    const f = (t.deal_id && porProceso.get(t.deal_id)) || (t.contacto && porContacto.get(t.contacto.id)) || null
    if (!f || !deCoordinacion(f)) continue
    const previa = tareaDe.get(f.id)
    if (!previa || (t.due_date ?? '') < (previa.due_date ?? '')) tareaDe.set(f.id, t)
    if (t.vencimiento.estado === 'vencida') elegidas.set(f.id, f)
  }
  for (const f of filas) if (deCoordinacion(f) && sinPrimerContacto(f)) elegidas.set(f.id, f)

  const vistos = new Set<string>()
  const r: ItemParaLlamar[] = []
  for (const f of [...elegidas.values()].sort((a, b) => Date.parse(a.creadoEn) - Date.parse(b.creadoEn) || a.id.localeCompare(b.id))) {
    const clave = f.contactoId ?? f.id
    if (vistos.has(clave)) continue
    vistos.add(clave)
    const t = tareaDe.get(f.id)
    const u = ultimoDe(f)
    const estado: ItemParaLlamar['estado'] = t
      ? {
          texto: t.vencimiento.texto,
          tipo: t.vencimiento.texto.startsWith('Espera') ? 'espera' : t.vencimiento.estado === 'vencida' ? 'vencida' : 'proxima',
        }
      : { texto: textoEspera(f.creadoEn, ahora), tipo: 'espera' }
    r.push({
      ...persona(f),
      llamada: `Llamada ${(llamadas.get(f.id) ?? 0) + 1}`,
      registrado: `Se registró ${haceCuanto(f.creadoEn, ahora)}`,
      estado,
      anterior: u && u.que === 'llamada' && u.resultado ? `Anterior: ${RESULTADO_CORTO[u.resultado].toLowerCase()}, ${fechaRelativa(u.at, ahora)}` : null,
    })
  }
  return r
}

// ── Sin respuesta tras WhatsApp y sin próximo paso ──────────────────

export interface ItemSinRespuesta extends PersonaDelInicio {
  linea: string
  registrado: string
}

/** Las solicitudes desde el registro, ya contactadas, sin ninguna tarea pendiente (de nadie). */
export function solicitudesSinTarea(filas: readonly FilaCartera[], conTarea: ReadonlySet<string>): FilaCartera[] {
  return filas.filter(
    (f) => f.abierto && !f.colega && !f.anteriorAlRegistro && f.etapa === 'solicitud' && !!ultimoDe(f)
      && !conTarea.has(f.id) && !(f.contactoId && conTarea.has(f.contactoId)),
  )
}

/**
 * Las solicitudes sin tarea se reparten en dos (auditoría de artefactos 3): con WhatsApp en
 * la racha → "Sin respuesta tras WhatsApp"; sin WhatsApp → "Sin próximo paso" (la secuencia
 * terminó, o la tarea no se pudo crear, o se dejó abierto tras "Número equivocado").
 */
export function sinRespuesta(
  sinTarea: readonly FilaCartera[],
  intentos: ReadonlyMap<string, IntentoDeCadencia[]>,
  ahora: Date,
): { conWhatsapp: ItemSinRespuesta[]; sinProximo: ItemSinRespuesta[] } {
  const conWhatsapp: ItemSinRespuesta[] = []
  const sinProximo: ItemSinRespuesta[] = []
  for (const f of [...sinTarea].sort((a, b) => Date.parse(a.creadoEn) - Date.parse(b.creadoEn))) {
    const deEste = (intentos.get(f.id) ?? []).filter((i) => !i.voided_at)
    const llamadas = deEste.filter((i) => i.kind === 'call').length
    const textoLlamadas = `${llamadas} ${llamadas === 1 ? 'llamada' : 'llamadas'}`
    const registrado = `Se registró ${diaYMes(f.creadoEn)}`
    if (estadoCadencia(deEste).whatsappEnLaRacha) {
      const wa = deEste.filter((i) => i.kind === 'whatsapp_sent').sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))[0]
      conWhatsapp.push({ ...persona(f), linea: `WhatsApp enviado ${haceCuanto(wa.occurred_at, ahora)} · ${textoLlamadas} sin atender`, registrado })
    } else {
      const u = ultimoDe(f)!
      sinProximo.push({ ...persona(f), linea: `Sin tarea pendiente · último contacto ${haceCuanto(u.at, ahora)} · ${textoLlamadas}`, registrado })
    }
  }
  return { conWhatsapp, sinProximo }
}

// ── Tasaciones, leads, procesos ─────────────────────────────────────

export interface ItemTasacion {
  procesoId: string
  contactoId: string | null
  nombre: string
  dia: 'Hoy' | 'Mañana'
  hora: string | null
  direccion: string | null
  asesor: string | null
}

export function tasacionesHoyYManana(filas: readonly FilaCartera[], ahora: Date): ItemTasacion[] {
  const hoy = enArgentina(ahora).fecha
  const manana = enArgentina(new Date(instanteDesdeAR(hoy, '12:00').getTime() + 86_400_000)).fecha
  return filas
    .filter((f) => f.abierto && !f.colega && f.tasacion && (f.tasacion.fecha === hoy || f.tasacion.fecha === manana))
    .sort((a, b) => Date.parse(a.tasacion!.instante) - Date.parse(b.tasacion!.instante))
    .map((f) => ({
      procesoId: f.id,
      contactoId: f.contactoId,
      nombre: f.nombre,
      dia: f.tasacion!.fecha === hoy ? 'Hoy' : 'Mañana',
      hora: f.tasacion!.hora,
      direccion: f.tasacion!.direccion,
      asesor: f.tasacion!.asesor,
    }))
}

export interface ItemLeadSinContacto extends PersonaDelInicio {
  espera: string
  registrado: string
}

export function leadsSinPrimerContacto(filas: readonly FilaCartera[], ahora: Date): ItemLeadSinContacto[] {
  return filas
    .filter((f) => deCoordinacion(f) && sinPrimerContacto(f))
    .sort((a, b) => Date.parse(a.creadoEn) - Date.parse(b.creadoEn))
    .map((f) => ({
      ...persona(f),
      espera: `${textoEspera(f.creadoEn, ahora)} · la llama la coordinación`,
      registrado: `Se registró ${haceCuanto(f.creadoEn, ahora)}`,
    }))
}

export interface ItemProcesoQueEspera extends PersonaDelInicio {
  etapa: string
  texto: string
}

/** Lo del asesor (recomendación 3): tasación pasada sin resultado, visita sin entregar, entregada sin respuesta. */
export function procesosQueEsperan(
  filas: readonly FilaCartera[],
  fechas: ReadonlyMap<string, { visited_at: string | null; delivered_at: string | null }>,
  ahora: Date,
): ItemProcesoQueEspera[] {
  const r: (ItemProcesoQueEspera & { desde: number })[] = []
  const dias = (iso: string) => diasDeCalendarioEntre(new Date(iso), ahora)
  for (const f of filas) {
    if (!f.abierto) continue
    const d = fechas.get(f.id)
    const etapa = NOMBRE_ETAPA[f.etapa as EtapaCRM] ?? f.etapa
    if (f.etapa === 'coordinada' && f.tasacion && Date.parse(f.tasacion.instante) < ahora.getTime()) {
      r.push({ ...persona(f), etapa, texto: `Cargar el resultado de la tasación: fue el ${diaCorto(f.tasacion.fecha)}.`, desde: Date.parse(f.tasacion.instante) })
    } else if (f.etapa === 'realizada' && d?.visited_at && dias(d.visited_at) >= 2) {
      r.push({ ...persona(f), etapa, texto: `Entregar la tasación: la visita fue hace ${dias(d.visited_at)} días.`, desde: Date.parse(d.visited_at) })
    } else if (f.etapa === 'entregada' && d?.delivered_at && dias(d.delivered_at) >= 5) {
      r.push({ ...persona(f), etapa, texto: `Llamar por la respuesta: la tasación se entregó hace ${dias(d.delivered_at)} días.`, desde: Date.parse(d.delivered_at) })
    }
  }
  return r.sort((a, b) => a.desde - b.desde).map((x) => {
    const { desde, ...resto } = x
    void desde
    return resto
  })
}

// ── Tiempo medio a la primera llamada ───────────────────────────────

/** El lunes 00:00 de Argentina de esta semana, o el inicio del registro de llamadas si es posterior. */
export function inicioDeCohorte(ahora: Date): Date {
  const a = enArgentina(ahora)
  const atras = (a.diaSemana + 6) % 7 // lunes = 0
  const lunes = new Date(instanteDesdeAR(a.fecha, '12:00').getTime() - atras * 86_400_000)
  const inicioLunes = instanteDesdeAR(enArgentina(lunes).fecha, '00:00')
  const registro = instanteDesdeAR(INICIO_REGISTRO_CONTACTOS, '00:00')
  return inicioLunes.getTime() > registro.getTime() ? inicioLunes : registro
}

export interface TiempoMedio {
  n: number
  sinLlamar: number
  reloj: string | null
  habiles: string | null
  pocos: boolean
}

export function tiempoMedio(leads: readonly { creadoEn: string; primeraLlamada: string | null }[]): TiempoMedio {
  const con = leads.filter((l) => l.primeraLlamada && Date.parse(l.primeraLlamada) >= Date.parse(l.creadoEn))
  const n = con.length
  const sinLlamar = leads.filter((l) => !l.primeraLlamada).length
  if (n === 0) return { n, sinLlamar, reloj: null, habiles: null, pocos: true }
  let reloj = 0
  let habiles = 0
  for (const l of con) {
    const desde = new Date(l.creadoEn)
    const hasta = new Date(l.primeraLlamada!)
    reloj += (hasta.getTime() - desde.getTime()) / 60_000
    habiles += minutosHabilesEntre(desde, hasta)
  }
  return { n, sinLlamar, reloj: duracion(reloj / n), habiles: duracion(habiles / n), pocos: n < 20 }
}

// ── Tareas ──────────────────────────────────────────────────────────

/**
 * La coordinación no ve en "Tareas de hoy" las llamadas vencidas que ya están en la cola
 * (se cruza por proceso, o por contacto si la tarea no tiene proceso; un "Mensaje" de esa
 * persona sí se ve: auditoría de artefactos 9).
 */
export function tareasSinLasDeLaCola(tareas: readonly TareaDeAgenda[], cola: readonly ItemParaLlamar[]): TareaDeAgenda[] {
  const procesos = new Set(cola.map((x) => x.procesoId))
  const contactos = new Set(cola.map((x) => x.contactoId).filter((x): x is string => !!x))
  return tareas.filter((t) => {
    if (t.tipo !== 'llamada' || t.vencimiento.estado !== 'vencida') return true
    if (t.deal_id) return !procesos.has(t.deal_id)
    return !(t.contacto && contactos.has(t.contacto.id))
  })
}

export function paraManana(proximas: readonly TareaDeAgenda[], ahora: Date): TareaDeAgenda[] {
  const manana = enArgentina(new Date(instanteDesdeAR(enArgentina(ahora).fecha, '12:00').getTime() + 86_400_000)).fecha
  return proximas.filter((t) => t.due_date === manana)
}

/** Una vez cada tarea repetida por coordinadora (mismo título, contacto y vencimiento). */
export function colapsarCopias(tareas: readonly TareaDeAgenda[]): TareaDeAgenda[] {
  const vistos = new Set<string>()
  return tareas.filter((t) => {
    const k = `${t.title}|${t.contacto?.id ?? ''}|${t.due_date ?? ''}|${t.due_time ?? ''}`
    if (vistos.has(k)) return false
    vistos.add(k)
    return true
  })
}

// ── Saludo ──────────────────────────────────────────────────────────

export function saludo(rol: string, nombre: string | null): string {
  if (rol === 'admin' || rol === 'dueno') return 'Inicio · vista del dueño'
  const primero = nombre?.trim().split(/\s+/)[0]
  return primero ? `Hola, ${primero}` : 'Hola'
}

/** "Miércoles 25 de noviembre · 10:40", en hora de Argentina. */
export function fechaDeHoy(ahora: Date): string {
  const f = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'long', day: 'numeric', month: 'long' }).format(ahora)
  const limpio = f.replace(',', '')
  return `${limpio[0].toUpperCase()}${limpio.slice(1)} · ${enArgentina(ahora).hora.slice(0, 5)}`
}
