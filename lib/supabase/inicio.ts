// Lecturas del Inicio (crm-inicio, D2). Reusa la cartera (las mismas reglas que el CRM) y
// suma lecturas chicas. Cada bloque se arma por separado: si uno falla, los demás llegan.
// Service role: la ruta ya decidió quién pide; cada lectura filtra por su vista o su id.
import { createClient } from '@supabase/supabase-js'
import type { IntentoDeCadencia } from '@/lib/crm/cadencia'
import type { FilaCartera } from '@/lib/crm/cartera'
import { enArgentina, instanteDesdeAR } from '@/lib/crm/horario-laboral'
import { INICIO_REGISTRO_CONTACTOS } from '@/lib/crm/ultimo-contacto'
import {
  colaParaLlamar,
  colapsarCopias,
  fechaDeHoy,
  inicioDeCohorte,
  leadsSinPrimerContacto,
  paraManana,
  procesosQueEsperan,
  saludo,
  sinRespuesta,
  solicitudesSinTarea,
  tareasSinLasDeLaCola,
  tasacionesHoyYManana,
  tiempoMedio,
  type ItemParaLlamar,
} from '@/lib/crm/inicio'
import { cargarCartera } from './cartera'
import { leerAgenda, type TareaDeAgenda } from './agenda-tareas'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export type Bloque<T> = { ok: true; datos: T } | { ok: false }
export type RolDelInicio = 'coordinacion' | 'asesor' | 'dueno'

const ROL: Record<string, RolDelInicio> = { coordinador: 'coordinacion', asesor: 'asesor', admin: 'dueno', dueno: 'dueno' }
export const rolDelInicio = (role: string): RolDelInicio | null => ROL[role] ?? null

type Res<T> = { data: T[] | null; error: { message: string } | null; count?: number | null }
async function filas<T>(q: PromiseLike<Res<unknown>>, que: string): Promise<T[]> {
  const { data, error } = await q
  if (error) throw new Error(`${que}: ${error.message}`)
  return (data ?? []) as T[]
}
async function contar(q: PromiseLike<Res<unknown>>, que: string): Promise<number> {
  const { count, error } = await q
  if (error) throw new Error(`${que}: ${error.message}`)
  return count ?? 0
}

/** Plazo común (auditoría de artefactos 10): un bloque colgado no frena la pantalla entera. */
export const PLAZO_INICIO_MS = 15_000

async function bloque<T>(p: Promise<T>, que: string, plazoMs = PLAZO_INICIO_MS): Promise<Bloque<T>> {
  let reloj: ReturnType<typeof setTimeout> | undefined
  const vencido = new Promise<never>((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new Error(`superó ${plazoMs / 1000} s`)), plazoMs)
  })
  try {
    return { ok: true, datos: await Promise.race([p, vencido]) }
  } catch (err) {
    console.error(`[inicio] falló ${que}:`, err)
    return { ok: false }
  } finally {
    clearTimeout(reloj)
  }
}

/** Tareas del día: vencidas + hoy, y las de mañana aparte. */
export interface TareasDelDia {
  hoy: TareaDeAgenda[]
  manana: TareaDeAgenda[]
}

export interface Numeros {
  solicitudes: number
  llamadas: number
  agendadas: number
  hasta: string
}

export interface VisitaDeHoy {
  id: string
  hora: string
  cliente: string | null
  direccion: string | null
  enlace: string
}

export interface RespuestaInicio {
  rol: RolDelInicio
  saludo: string
  fecha: string
  bloques: Record<string, Bloque<unknown>>
}

export async function leerInicio(
  usuario: { id: string; role: string; nombre: string | null },
  ahora: Date,
): Promise<RespuestaInicio | null> {
  const rol = rolDelInicio(usuario.role)
  if (!rol) return null
  const db = getAdmin()
  const hoy = enArgentina(ahora).fecha
  const inicioHoy = instanteDesdeAR(hoy, '00:00').toISOString()

  // La cartera. La coordinación y el dueño necesitan TODOS los procesos y las tareas de
  // TODAS las coordinadoras (la cola es una sola: auditoría de artefactos 1), así que se lee
  // la vista completa y las reglas filtran lo de la coordinación. Los datos no salen del
  // servidor: cada bloque devuelve solo lo suyo. El asesor lee su propia vista.
  const verTodo = rol !== 'asesor'
  const carteraP = cargarCartera({ quien: { id: usuario.id, role: verTodo ? 'dueno' : usuario.role }, verComo: null }, ahora).then((r) => {
    if (!r.ok) throw new Error(`cartera: ${r.motivo}`)
    // Un dato que falló no se muestra como vacío (auditoría de artefactos 6).
    if (r.datos.fuentes.ultimoContacto === 'error' || r.datos.fuentes.tareas === 'error' || r.datos.truncado) {
      throw new Error('cartera: una fuente falló o vino cortada')
    }
    return r.datos.filas
  })
  const perfilesP = filas<{ id: string; role: string; is_active: boolean | null }>(
    db.from('profiles').select('id, role, is_active').eq('is_active', true),
    'perfiles',
  )
  const coordinacionP = perfilesP.then((ps) => ps.filter((p) => p.role === 'coordinador').map((p) => p.id))

  const bloques: Record<string, Promise<Bloque<unknown>>> = {}

  if (rol === 'coordinacion' || rol === 'dueno') {
    const tareasCoordP = coordinacionP.then((c) =>
      c.length === 0 ? null : leerAgenda({ asignados: c, tipo: null, sinFechaDesde: 0 }, ahora),
    )
    // Llamadas y WhatsApp desde el inicio del registro (la tabla es chica): dan "Llamada N"
    // y la racha de cada proceso, sin una lista de ids en la URL.
    const intentosP = filas<IntentoDeCadencia & { deal_id: string | null }>(
      db.from('contact_activities').select('id, deal_id, kind, call_outcome, occurred_at, created_at, voided_at')
        .in('kind', ['call', 'whatsapp_sent']).is('voided_at', null)
        .gte('occurred_at', instanteDesdeAR(INICIO_REGISTRO_CONTACTOS, '00:00').toISOString()),
      'intentos',
    ).then((xs) => {
      const porProceso = new Map<string, IntentoDeCadencia[]>()
      for (const i of xs) if (i.deal_id) porProceso.set(i.deal_id, [...(porProceso.get(i.deal_id) ?? []), i])
      return porProceso
    })
    const colaP: Promise<ItemParaLlamar[]> = Promise.all([carteraP, tareasCoordP, intentosP]).then(([f, a, intentos]) => {
      const tareas = a ? [...a.grupos.vencidas, ...a.grupos.hoy, ...a.grupos.proximas] : []
      const llamadas = new Map([...intentos].map(([id, xs]) => [id, xs.filter((x) => x.kind === 'call').length]))
      return colaParaLlamar(f, tareas, llamadas, ahora)
    })
    bloques.paraLlamar = bloque(colaP, 'para llamar')
    // Las solicitudes contactadas sin NINGUNA tarea pendiente (de nadie; también las que
    // se agendaron solo con el contacto, desde la ficha: auditoría de artefactos 2).
    const sinTareaP = Promise.all([
      carteraP,
      filas<{ deal_id: string | null; contact_id: string | null }>(
        db.from('tasks').select('deal_id, contact_id').eq('status', 'pending').range(0, 4999),
        'tareas pendientes',
      ),
      intentosP,
    ]).then(([f, pendientes, intentos]) => {
      const conTarea = new Set<string>()
      for (const t of pendientes) {
        if (t.deal_id) conTarea.add(t.deal_id)
        if (t.contact_id) conTarea.add(t.contact_id)
      }
      return sinRespuesta(solicitudesSinTarea(f, conTarea), intentos, ahora)
    })
    bloques.sinRespuesta = bloque(sinTareaP.then((x) => x.conWhatsapp), 'sin respuesta')
    bloques.sinProximo = bloque(sinTareaP.then((x) => x.sinProximo), 'sin próximo paso')
    bloques.tasaciones = bloque(carteraP.then((f) => tasacionesHoyYManana(f, ahora)), 'tasaciones')
    // Números del día (auditoría de artefactos 7): solicitudes del embudo de tasación creadas
    // hoy; llamadas registradas hoy por cualquiera, sin anuladas, por la hora en que ocurrieron.
    bloques.numeros = bloque(
      Promise.all([
        contar(db.from('deals').select('id', { count: 'exact', head: true }).gte('created_at', inicioHoy).eq('origin', 'embudo'), 'solicitudes de hoy'),
        contar(db.from('contact_activities').select('id', { count: 'exact', head: true }).eq('kind', 'call').is('voided_at', null).gte('occurred_at', inicioHoy), 'llamadas de hoy'),
        contar(db.from('contact_activities').select('id', { count: 'exact', head: true }).eq('kind', 'call').eq('call_outcome', 'agendo').is('voided_at', null).gte('occurred_at', inicioHoy), 'agendadas de hoy'),
      ]).then(([solicitudes, llamadas, agendadas]): Numeros => ({ solicitudes, llamadas, agendadas, hasta: enArgentina(ahora).hora.slice(0, 5) })),
      'números del día',
    )
    if (rol === 'coordinacion') {
      bloques.tareas = bloque(
        Promise.all([leerAgenda({ asignados: [usuario.id], tipo: null, sinFechaDesde: 0 }, ahora), colaP.catch(() => [] as ItemParaLlamar[])]).then(([a, cola]): TareasDelDia => ({
          hoy: tareasSinLasDeLaCola([...a.grupos.vencidas, ...a.grupos.hoy], cola),
          manana: paraManana(a.grupos.proximas, ahora),
        })),
        'tareas',
      )
    } else {
      bloques.tareas = bloque(
        tareasCoordP.then((a): TareasDelDia => (a
          ? { hoy: colapsarCopias([...a.grupos.vencidas, ...a.grupos.hoy]), manana: colapsarCopias(paraManana(a.grupos.proximas, ahora)) }
          : { hoy: [], manana: [] })),
        'tareas de la coordinación',
      )
      bloques.leadsSinContacto = bloque(carteraP.then((f) => leadsSinPrimerContacto(f, ahora)), 'leads sin contacto')
      // Cohorte: solicitudes del embudo de tasación creadas desde el lunes (y desde el
      // registro), en cualquier etapa actual; primera llamada = la más vieja de ese proceso.
      bloques.tiempoMedio = bloque(
        (async () => {
          const desde = inicioDeCohorte(ahora).toISOString()
          const leads = await filas<{ id: string; created_at: string }>(
            db.from('deals').select('id, created_at').gte('created_at', desde).eq('origin', 'embudo'),
            'leads de la semana',
          )
          if (leads.length === 0) return tiempoMedio([])
          const llamadas = await filas<{ deal_id: string; occurred_at: string }>(
            db.from('contact_activities').select('deal_id, occurred_at').eq('kind', 'call').is('voided_at', null).gte('occurred_at', desde),
            'primeras llamadas',
          )
          const primera = new Map<string, string>()
          for (const l of llamadas) {
            const p = primera.get(l.deal_id)
            if (!p || Date.parse(l.occurred_at) < Date.parse(p)) primera.set(l.deal_id, l.occurred_at)
          }
          return tiempoMedio(leads.map((l) => ({ creadoEn: l.created_at, primeraLlamada: primera.get(l.id) ?? null })))
        })(),
        'tiempo medio',
      )
    }
  } else {
    // Asesor: solo lo suyo (su cartera, sus tareas, sus visitas).
    bloques.tareas = bloque(
      leerAgenda({ asignados: [usuario.id], tipo: null, sinFechaDesde: 0 }, ahora).then((a): TareasDelDia => ({
        hoy: [...a.grupos.vencidas, ...a.grupos.hoy],
        manana: paraManana(a.grupos.proximas, ahora),
      })),
      'tareas',
    )
    bloques.procesos = bloque(
      carteraP.then(async (f: FilaCartera[]) => {
        const ids = f.filter((x) => x.abierto && (x.etapa === 'realizada' || x.etapa === 'entregada')).map((x) => x.id)
        const fechas = ids.length === 0 ? [] : await filas<{ id: string; visited_at: string | null; delivered_at: string | null }>(
          db.from('deals').select('id, visited_at, delivered_at').in('id', ids).eq('assigned_to', usuario.id),
          'fechas de los procesos',
        )
        return procesosQueEsperan(f, new Map(fechas.map((x) => [x.id, x])), ahora)
      }),
      'procesos',
    )
    bloques.visitas = bloque(
      Promise.all([
        filas<{ id: string; scheduled_at: string; client_name: string | null; status: string; propiedad: { address: string | null } | null }>(
          db.from('property_visits').select('id, scheduled_at, client_name, status, propiedad:property_id(address)')
            .eq('advisor_id', usuario.id).gte('scheduled_at', inicioHoy)
            .lt('scheduled_at', instanteDesdeAR(hoy, '23:59').toISOString()).neq('status', 'cancelled'),
          'visitas de hoy',
        ),
        carteraP,
      ]).then(([v, f]): VisitaDeHoy[] => {
        const visitas = v.map((x) => ({
          id: `visita:${x.id}`,
          hora: enArgentina(new Date(x.scheduled_at)).hora.slice(0, 5),
          cliente: x.client_name,
          direccion: x.propiedad?.address ?? null,
          enlace: `/visits/${x.id}`,
        }))
        const tasaciones = tasacionesHoyYManana(f, ahora).filter((t) => t.dia === 'Hoy').map((t) => ({
          id: `tasacion:${t.procesoId}`,
          hora: t.hora ?? 'Todo el día',
          cliente: t.nombre,
          direccion: t.direccion,
          enlace: t.contactoId ? `/contacts/${t.contactoId}` : `/pipeline/${t.procesoId}`,
        }))
        return [...visitas, ...tasaciones].sort((a, b) => a.hora.localeCompare(b.hora))
      }),
      'visitas y tasaciones de hoy',
    )
  }

  const claves = Object.keys(bloques)
  const resueltos = await Promise.all(claves.map((k) => bloques[k]))
  return {
    rol,
    saludo: saludo(usuario.role, usuario.nombre),
    fecha: fechaDeHoy(ahora),
    bloques: Object.fromEntries(claves.map((k, i) => [k, resueltos[i]])),
  }
}
