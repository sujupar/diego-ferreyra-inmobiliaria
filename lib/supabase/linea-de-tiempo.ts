// Lecturas de los eventos del sistema de un contacto (crm-linea-de-tiempo, design.md D4).
// Service role: la ruta que llama ya decidió que quien pide puede abrir la ficha, y es la
// única barrera. Cada fuente se lee por separado y su falla se informa sin tapar a las
// demás. Toda consulta filtra por ESTE contacto (o por sus procesos, o su teléfono):
// una consulta sin ese filtro mostraría la historia de otra persona.
//
// Alcance del asesor (spec crm-ficha-contacto, "Asesor en un contacto que también atiende
// otro asesor"): lo de un proceso que no está a su nombre —sus cambios de etapa, su
// registro, sus tareas— no se le lista ni viaja por la red. Lo de la PERSONA (WhatsApp,
// video) sí, igual que las notas y llamadas.
import { createClient } from '@supabase/supabase-js'
import { tareasVisiblesEnFicha } from '@/lib/crm/tareas-ficha'
import {
  eventosDeEtapa,
  eventosDeRegistro,
  eventosDeTareas,
  eventosDeVideo,
  eventosDeWhatsapp,
  telefonoUtilizable,
  type ClaseEvento,
  type CursorLinea,
  type EventoSistema,
  type FilaHistorial,
  type FilaRegistro,
  type FilaTarea,
  type FilaVideo,
  type FilaWhatsapp,
} from '@/lib/crm/linea-de-tiempo'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export const PLAZO_LINEA_MS = 15_000
/** Tope de tareas por contacto: sus dos fechas (creada y completada) no se pueden cortar en la base. */
const TOPE_TAREAS = 500
/**
 * Filas de más por fuente: con el cursor se lee hasta su milisegundo INCLUSIVE, así que lo
 * ya mostrado con esa misma fecha vuelve y se descarta. Sin este margen, "hay más" daría
 * falso cuando la página siguiente sale de una sola fuente.
 */
export const MARGEN_EMPATES = 20

type Resultado<T> = { data: T[] | null; error: { message: string } | null }

async function filas<T>(consulta: PromiseLike<Resultado<unknown>>, que: string): Promise<T[]> {
  const { data, error } = await consulta
  if (error) throw new Error(`${que}: ${error.message}`)
  return (data ?? []) as T[]
}

export const ultimos10 = (tel: string | null | undefined) => {
  const d = (tel ?? '').replace(/\D/g, '')
  return d.length >= 10 ? d.slice(-10) : null
}

/**
 * El límite de la consulta para un cursor: el milisegundo SIGUIENTE, con `<`. Las fechas de
 * la base tienen microsegundos; `<=` al milisegundo dejaría afuera los empates que la
 * página siguiente tiene que mostrar. El orden fino lo decide `unirYCortar`.
 */
export function limiteDeCursor(fecha: string): string {
  return new Date(Date.parse(fecha) + 1).toISOString()
}

/** Teléfonos de avisos internos fijos (variables de entorno de las consultas de portal). */
function telefonosDeEntorno(): string[] {
  const crudos = [...(process.env.WHATSAPP_CC_PHONES ?? '').split(','), process.env.WHATSAPP_FALLBACK_PHONE ?? '']
  return crudos.map(ultimos10).filter((x): x is string => !!x)
}

export interface AlcanceLinea {
  usuarioId: string
  /** Asesor: solo lo de los procesos a su nombre (y lo de la persona). */
  soloPropios: boolean
}

export interface LecturaEventos {
  eventos: EventoSistema[]
  fuentesConError: ClaseEvento[]
}

interface ProcesoLeido {
  id: string
  meta_ad_name: string | null
  created_at: string
  scheduled_date: string | null
  assigned_to: string | null
}

/**
 * Los eventos del sistema de un contacto, desde el cursor (inclusive: los empates los
 * corta `unirYCortar`). Cada fuente con fecha en una sola columna trae hasta
 * `limite + 1 + MARGEN_EMPATES`.
 */
export async function leerEventosDelSistema(
  contactId: string,
  cursor: CursorLinea | null,
  limite: number,
  alcance: AlcanceLinea,
): Promise<LecturaEventos> {
  const db = getAdmin()
  const ctrl = new AbortController()
  const reloj = setTimeout(() => ctrl.abort(), PLAZO_LINEA_MS)
  const s = ctrl.signal
  const hasta = cursor ? limiteDeCursor(cursor.fecha) : null
  const n = limite + 1 + MARGEN_EMPATES

  try {
    const conCorte = <Q extends { lt: (c: string, v: string) => Q }>(q: Q, col: string): Q => (hasta ? q.lt(col, hasta) : q)

    // Procesos del contacto: los necesitan el registro (anuncio), las etapas y las tareas.
    const procesosP = filas<ProcesoLeido>(
      db.from('deals').select('id, meta_ad_name, created_at, scheduled_date, assigned_to').eq('contact_id', contactId).abortSignal(s),
      'procesos',
    ).then((todos) => {
      const visibles = alcance.soloPropios ? todos.filter((p) => p.assigned_to === alcance.usuarioId) : todos
      return { todos, visibles }
    })
    // Los registros del contacto son pocos (máximo 8 medido): se leen todos, porque
    // también dicen qué procesos nacieron de un registro.
    const registrosP = filas<FilaRegistro>(
      db.from('funnel_lead_submissions').select('id, funnel, status, deal_id, created_at')
        .eq('contact_id', contactId).eq('status', 'complete').abortSignal(s),
      'registros',
    )

    const etapasP = procesosP.then(({ visibles }) =>
      visibles.length === 0
        ? []
        : filas<FilaHistorial>(
            conCorte(
              db.from('deal_stage_history').select('id, deal_id, from_stage, to_stage, changed_at, changed_by, metadata')
                .in('deal_id', visibles.map((p) => p.id)),
              'changed_at',
            ).order('changed_at', { ascending: false }).limit(n).abortSignal(s),
            'etapas',
          ),
    )

    // Las del contacto Y las de sus procesos (17 tareas tienen proceso sin contacto), con
    // la misma regla de visibilidad que el bloque "Tareas" de la ficha.
    const tareasP = procesosP.then(async ({ todos }) => {
      const ids = todos.map((p) => p.id)
      const filtro = ids.length > 0 ? `contact_id.eq.${contactId},deal_id.in.(${ids.join(',')})` : `contact_id.eq.${contactId}`
      const leidas = await filas<FilaTarea & { type: string; deal_id: string | null }>(
        db.from('tasks')
          .select('id, type, title, status, deal_id, assigned_to, created_at, created_by, completed_at, completed_by, source_activity_id')
          .or(filtro).order('created_at', { ascending: false }).limit(TOPE_TAREAS).abortSignal(s),
        'tareas',
      )
      return tareasVisiblesEnFicha(leidas, {
        dealsConTasacionAgendada: [],
        dealsOcultos: alcance.soloPropios ? todos.filter((p) => p.assigned_to !== alcance.usuarioId).map((p) => p.id) : [],
        usuarioId: alcance.usuarioId,
        soloPropiasSinProceso: alcance.soloPropios,
      })
    })

    const videoP = filas<FilaVideo>(
      conCorte(
        db.from('video_view_state').select('id, video_key, max_percent, first_at, playback_started')
          .eq('contact_id', contactId).eq('playback_started', true),
        'first_at',
      ).order('first_at', { ascending: false }).limit(n).abortSignal(s),
      'video',
    )

    // Todos los perfiles en una lectura (son pocos): dan los teléfonos del equipo, los
    // nombres y quién es de la coordinación, sin un viaje más al final.
    const perfilesP = filas<{ id: string; full_name: string | null; role: string | null; phone: string | null }>(
      db.from('profiles').select('id, full_name, role, phone').abortSignal(s),
      'perfiles',
    )
    const contactoP = filas<{ phone_norm: string | null }>(
      db.from('contacts').select('phone_norm').eq('id', contactId).abortSignal(s),
      'contacto',
    )

    // WhatsApp (decisión 5 del dueño): solo si el teléfono es de esta persona y de nadie
    // más. Si algo no se puede comprobar, no se muestra ninguno (falla cerrada). Las
    // comprobaciones y los mensajes van en paralelo: los mensajes se descartan si alguna no pasa.
    const whatsappP = (async () => {
      const [[contacto], perfiles] = await Promise.all([contactoP, perfilesP])
      const tel = ultimos10(contacto?.phone_norm)
      if (!tel) return []
      const telefonosEquipo = new Set([
        ...perfiles.map((p) => ultimos10(p.phone)).filter((x): x is string => !!x),
        ...telefonosDeEntorno(),
      ])
      if (!telefonoUtilizable(tel, telefonosEquipo, false)) return []
      const [otros, avisos, primero, ultimo, mensajes] = await Promise.all([
        filas<{ id: string }>(
          db.from('contacts').select('id').eq('phone_norm', tel).neq('id', contactId).limit(1).abortSignal(s),
          'compartidos',
        ),
        // Un número que recibió avisos de consultas es del equipo, esté o no en `profiles`
        // (la copia de las consultas va a números de variables de entorno).
        filas<{ id: string }>(
          db.from('whatsapp_messages').select('id').like('phone_e164', `%${tel}`).like('template_name', 'consulta_portal%')
            .limit(1).abortSignal(s),
          'avisos al equipo',
        ),
        // Los 10 dígitos pueden coincidir con un número de otro país: el menor y el mayor
        // número completo dicen si hay más de uno.
        filas<{ phone_e164: string }>(
          db.from('whatsapp_messages').select('phone_e164').like('phone_e164', `%${tel}`)
            .order('phone_e164', { ascending: true }).limit(1).abortSignal(s),
          'primer número',
        ),
        filas<{ phone_e164: string }>(
          db.from('whatsapp_messages').select('phone_e164').like('phone_e164', `%${tel}`)
            .order('phone_e164', { ascending: false }).limit(1).abortSignal(s),
          'último número',
        ),
        filas<FilaWhatsapp>(
          conCorte(
            db.from('whatsapp_messages')
              .select('id, direction, status, template_name, body_preview, sent_by, ai_generated, created_at')
              .like('phone_e164', `%${tel}`),
            'created_at',
          ).order('created_at', { ascending: false }).limit(n).abortSignal(s),
          'whatsapp',
        ),
      ])
      if (otros.length > 0 || avisos.length > 0) return []
      if (primero[0]?.phone_e164 !== ultimo[0]?.phone_e164) return []
      return mensajes
    })()

    const [procesos, registros, etapas, tareas, video, whatsapp] = await Promise.allSettled([
      procesosP, registrosP, etapasP, tareasP, videoP, whatsappP,
    ])

    const fuentesConError: ClaseEvento[] = []
    const marcar = (clase: ClaseEvento, motivo: unknown) => {
      console.error(`[linea-de-tiempo] falló ${clase}:`, motivo)
      if (!fuentesConError.includes(clase)) fuentesConError.push(clase)
    }
    const ok = <T>(r: PromiseSettledResult<T>, clase: ClaseEvento): T | null => {
      if (r.status === 'fulfilled') return r.value
      marcar(clase, r.reason)
      return null
    }

    // Registro y etapas dependen de los procesos y de los registros: si falta uno, las dos
    // quedan con error (sin saber qué procesos nacieron de un registro, la apertura se
    // duplicaría; sin los procesos, no se sabe qué registro le toca ver al asesor).
    let listaRegistros: FilaRegistro[] | null = null
    let listaEtapas: FilaHistorial[] | null = null
    if (procesos.status === 'rejected' || registros.status === 'rejected') {
      const motivo = procesos.status === 'rejected' ? procesos.reason : (registros as PromiseRejectedResult).reason
      marcar('registro', motivo)
      marcar('etapa', motivo)
    } else {
      const visibles = new Set(procesos.value.visibles.map((p) => p.id))
      listaRegistros = registros.value.filter((r) => !r.deal_id || !alcance.soloPropios || visibles.has(r.deal_id))
      listaEtapas = ok(etapas, 'etapa')
    }
    const listaTareas = ok(tareas, 'tarea')
    const listaVideo = ok(video, 'video')
    const listaWhatsapp = ok(whatsapp, 'whatsapp')

    // Sin nombres, cada evento perdería su autor sin avisar: si no se pudieron leer los
    // perfiles, falla todo (la ruta lo muestra como "Parte de la historia no se pudo cargar").
    const perfiles = await perfilesP
    const nombres = new Map<string, string>()
    const coordinacion = new Set<string>()
    for (const p of perfiles) {
      if (p.full_name?.trim()) nombres.set(p.id, p.full_name.trim())
      if (p.role === 'coordinador') coordinacion.add(p.id)
    }

    const todos = procesos.status === 'fulfilled' ? procesos.value.todos : []
    const mapaProcesos = new Map(todos.map((p) => [p.id, p]))
    const conRegistro = new Set((listaRegistros ?? []).map((r) => r.deal_id).filter((x): x is string => !!x))
    const eventos = [
      ...(listaRegistros ? eventosDeRegistro(listaRegistros, mapaProcesos) : []),
      ...(listaEtapas ? eventosDeEtapa(listaEtapas, conRegistro, mapaProcesos, nombres) : []),
      ...(listaTareas ? eventosDeTareas(listaTareas, nombres, coordinacion) : []),
      ...(listaWhatsapp ? eventosDeWhatsapp(listaWhatsapp, nombres) : []),
      ...(listaVideo ? eventosDeVideo(listaVideo) : []),
    ]
    return { eventos, fuentesConError }
  } finally {
    clearTimeout(reloj)
  }
}
