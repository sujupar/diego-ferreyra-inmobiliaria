// Reglas del Inicio (crm-inicio, D1). Puro: trabaja sobre las filas de la cartera (las MISMAS
// reglas que el CRM) y datos chicos, y devuelve los textos listos para dibujar.

import { RESULTADO_CORTO } from './actividades'
import { estadoCadencia, type IntentoDeCadencia } from './cadencia'
import { sinPrimerContacto, type FilaCartera } from './cartera'
import { textoEspera } from './cartera-trabado'
import { NOMBRE_ETAPA, type EtapaCRM } from './etapas'
import { diaCorto, duracion, fechaRelativa, haceCuanto, textoVencimiento } from './formato-fecha'
import { diasDeCalendarioEntre, enArgentina, instanteDesdeAR, minutosHabilesEntre } from './horario-laboral'
import { vencimientoDeTarea } from './tareas-ficha'
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

function vencido(p: Proximo, ahora: Date): boolean {
  if (p.espera) return Date.parse(p.espera.registradoEn) <= ahora.getTime()
  return vencimientoDeTarea(p.vence, ahora).vencida
}

/**
 * La cola de la coordinación (spec "Para llamar ahora"): solicitudes desde el registro de
 * llamadas sin primer contacto, y personas con una llamada de la coordinación ya vencida.
 * Una vez por persona, de la más vieja a la más nueva.
 */
export function colaParaLlamar(filas: readonly FilaCartera[], coordinacion: ReadonlySet<string>, ahora: Date): ItemParaLlamar[] {
  const elegidas = filas
    .filter((f) => {
      if (!f.abierto || f.anteriorAlRegistro) return false
      if (sinPrimerContacto(f)) return true
      const p = proximoDe(f)
      return !!p && p.clase === 'tarea' && ES_LLAMADA.test(p.titulo) && !!p.quien && coordinacion.has(p.quien.id) && vencido(p, ahora)
    })
    .sort((a, b) => Date.parse(a.creadoEn) - Date.parse(b.creadoEn) || a.id.localeCompare(b.id))
  const vistos = new Set<string>()
  const r: ItemParaLlamar[] = []
  for (const f of elegidas) {
    const clave = f.contactoId ?? f.id
    if (vistos.has(clave)) continue
    vistos.add(clave)
    const p = proximoDe(f)
    const u = ultimoDe(f)
    let estado: ItemParaLlamar['estado']
    if (p) {
      const v = textoVencimiento(p.vence, ahora, { todoElDia: p.vence.all_day, ...(p.espera ? { espera: p.espera } : {}) })
      estado = { texto: v.texto, tipo: v.texto.startsWith('Espera') ? 'espera' : v.estado === 'vencida' ? 'vencida' : 'proxima' }
    } else {
      estado = { texto: textoEspera(f.creadoEn, ahora), tipo: 'espera' }
    }
    r.push({
      ...persona(f),
      llamada: p && /^Llamada \d+$/.test(p.titulo) ? p.titulo : 'Llamada 1',
      registrado: `Se registró ${haceCuanto(f.creadoEn, ahora)}`,
      estado,
      anterior: u && u.que === 'llamada' && u.resultado ? `Anterior: ${RESULTADO_CORTO[u.resultado].toLowerCase()}, ${fechaRelativa(u.at, ahora)}` : null,
    })
  }
  return r
}

// ── Sin respuesta tras WhatsApp ─────────────────────────────────────

export interface ItemSinRespuesta extends PersonaDelInicio {
  linea: string
  registrado: string
}

/**
 * Solicitudes desde el registro a las que ya se llamó y se les marcó un WhatsApp en la racha,
 * sin ninguna tarea pendiente (spec "Sin respuesta tras WhatsApp").
 */
export function sinRespuesta(
  filas: readonly FilaCartera[],
  intentos: ReadonlyMap<string, IntentoDeCadencia[]>,
  ahora: Date,
): ItemSinRespuesta[] {
  const r: (ItemSinRespuesta & { creado: number })[] = []
  for (const f of filas) {
    if (!f.abierto || f.anteriorAlRegistro || f.etapa !== 'solicitud' || !ultimoDe(f) || f.proximo !== null) continue
    const deEste = (intentos.get(f.id) ?? []).filter((i) => !i.voided_at)
    if (!estadoCadencia(deEste).whatsappEnLaRacha) continue
    const wa = deEste.filter((i) => i.kind === 'whatsapp_sent').sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))[0]
    const llamadas = deEste.filter((i) => i.kind === 'call').length
    r.push({
      ...persona(f),
      linea: `WhatsApp enviado ${haceCuanto(wa.occurred_at, ahora)} · ${llamadas} ${llamadas === 1 ? 'llamada' : 'llamadas'} sin atender`,
      registrado: `Se registró ${diaYMes(f.creadoEn)}`,
      creado: Date.parse(f.creadoEn),
    })
  }
  return r.sort((a, b) => a.creado - b.creado).map((x) => {
    const { creado, ...resto } = x
    void creado
    return resto
  })
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
    .filter((f) => f.abierto && f.tasacion && (f.tasacion.fecha === hoy || f.tasacion.fecha === manana))
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
    .filter((f) => sinPrimerContacto(f))
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

/** La coordinación no ve en "Tareas de hoy" las llamadas que ya están en la cola. */
export function tareasSinLasDeLaCola(tareas: readonly TareaDeAgenda[], contactosEnCola: ReadonlySet<string>): TareaDeAgenda[] {
  return tareas.filter((t) => !(t.tipo === 'llamada' && t.vencimiento.estado === 'vencida' && t.contacto && contactosEnCola.has(t.contacto.id)))
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
