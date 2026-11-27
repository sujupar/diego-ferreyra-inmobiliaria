// Lecturas de los eventos del sistema de un contacto (crm-linea-de-tiempo, design.md D4).
// Service role: la ruta que llama ya decidió que quien pide puede abrir la ficha, y es la
// única barrera. Cada fuente se lee por separado y su falla se informa sin tapar a las
// demás. Toda consulta filtra por ESTE contacto (o por sus procesos, o su teléfono):
// una consulta sin ese filtro mostraría la historia de otra persona.
import { createClient } from '@supabase/supabase-js'
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

export interface LecturaEventos {
  eventos: EventoSistema[]
  fuentesConError: ClaseEvento[]
}

/**
 * Los eventos del sistema de un contacto, desde el cursor (inclusive: los empates los
 * corta `unirYCortar`). Cada fuente con fecha en una sola columna trae hasta `limite + 1`.
 */
export async function leerEventosDelSistema(
  contactId: string,
  cursor: CursorLinea | null,
  limite: number,
): Promise<LecturaEventos> {
  const db = getAdmin()
  const ctrl = new AbortController()
  const reloj = setTimeout(() => ctrl.abort(), PLAZO_LINEA_MS)
  const s = ctrl.signal
  const hasta = cursor?.fecha ?? null
  const n = limite + 1

  try {
    const conCorte = <Q extends { lte: (c: string, v: string) => Q }>(q: Q, col: string): Q => (hasta ? q.lte(col, hasta) : q)

    // Procesos del contacto: los necesitan el registro (anuncio) y las etapas.
    const procesosP = filas<{ id: string; meta_ad_name: string | null }>(
      db.from('deals').select('id, meta_ad_name').eq('contact_id', contactId).abortSignal(s),
      'procesos',
    )
    // Los registros del contacto son pocos (máximo 8 medido): se leen todos, porque
    // también dicen qué procesos nacieron de un registro.
    const registrosP = filas<FilaRegistro & { contact_id: string }>(
      db.from('funnel_lead_submissions').select('id, funnel, status, deal_id, created_at')
        .eq('contact_id', contactId).eq('status', 'complete').abortSignal(s),
      'registros',
    )

    const etapasP = procesosP.then((ps) =>
      ps.length === 0
        ? []
        : filas<FilaHistorial>(
            conCorte(
              db.from('deal_stage_history').select('id, deal_id, from_stage, to_stage, changed_at, changed_by')
                .in('deal_id', ps.map((p) => p.id)),
              'changed_at',
            ).order('changed_at', { ascending: false }).limit(n).abortSignal(s),
            'etapas',
          ),
    )

    const tareasP = filas<FilaTarea>(
      db.from('tasks')
        .select('id, title, status, assigned_to, created_at, created_by, completed_at, completed_by, source_activity_id')
        .eq('contact_id', contactId).order('created_at', { ascending: false }).limit(TOPE_TAREAS).abortSignal(s),
      'tareas',
    )

    const videoP = filas<FilaVideo>(
      conCorte(
        db.from('video_view_state').select('id, video_key, max_percent, first_at, playback_started')
          .eq('contact_id', contactId).eq('playback_started', true),
        'first_at',
      ).order('first_at', { ascending: false }).limit(n).abortSignal(s),
      'video',
    )

    // WhatsApp (decisión 5 del dueño): solo si el teléfono es de esta persona y de nadie
    // más. Si no se puede comprobar, no se muestra ninguno (falla cerrada).
    const whatsappP = (async () => {
      const [contacto] = await filas<{ phone_norm: string | null }>(
        db.from('contacts').select('phone_norm').eq('id', contactId).abortSignal(s),
        'contacto',
      )
      const tel = ultimos10(contacto?.phone_norm)
      if (!tel) return []
      const [equipo, otros] = await Promise.all([
        filas<{ phone: string | null }>(db.from('profiles').select('phone').not('phone', 'is', null).abortSignal(s), 'equipo'),
        filas<{ id: string }>(
          db.from('contacts').select('id').eq('phone_norm', tel).neq('id', contactId).limit(1).abortSignal(s),
          'compartidos',
        ),
      ])
      const telefonosEquipo = new Set(equipo.map((p) => ultimos10(p.phone)).filter((x): x is string => !!x))
      const usable = telefonoUtilizable(tel, telefonosEquipo, otros.length > 0)
      if (!usable) return []
      return filas<FilaWhatsapp>(
        conCorte(
          db.from('whatsapp_messages')
            .select('id, direction, status, template_name, body_preview, sent_by, ai_generated, created_at')
            .like('phone_e164', `%${usable}`),
          'created_at',
        ).order('created_at', { ascending: false }).limit(n).abortSignal(s),
        'whatsapp',
      )
    })()

    const [procesos, registros, etapas, tareas, video, whatsapp] = await Promise.allSettled([
      procesosP, registrosP, etapasP, tareasP, videoP, whatsappP,
    ])

    const fuentesConError: ClaseEvento[] = []
    const ok = <T>(r: PromiseSettledResult<T>, clase: ClaseEvento): T | null => {
      if (r.status === 'fulfilled') return r.value
      console.error(`[linea-de-tiempo] falló ${clase}:`, r.reason)
      if (!fuentesConError.includes(clase)) fuentesConError.push(clase)
      return null
    }

    const listaProcesos = ok(procesos, 'registro')
    if (!listaProcesos) ok(procesos, 'etapa')
    const listaRegistros = listaProcesos ? ok(registros, 'registro') : null
    // Sin saber qué procesos nacieron de un registro, la apertura se duplicaría.
    const listaEtapas = listaProcesos && registros.status === 'fulfilled' ? ok(etapas, 'etapa') : null
    if (listaProcesos && registros.status === 'rejected') ok(registros, 'etapa')
    const listaTareas = ok(tareas, 'tarea')
    const listaVideo = ok(video, 'video')
    const listaWhatsapp = ok(whatsapp, 'whatsapp')

    // Nombres de todos los que aparecen como autor o asignado, en una sola lectura.
    const idsPersonas = new Set<string>()
    for (const e of listaEtapas ?? []) if (e.changed_by) idsPersonas.add(e.changed_by)
    for (const t of listaTareas ?? []) for (const x of [t.assigned_to, t.created_by, t.completed_by]) if (x) idsPersonas.add(x)
    for (const w of listaWhatsapp ?? []) if (w.sent_by) idsPersonas.add(w.sent_by)
    const nombres = new Map<string, string>()
    if (idsPersonas.size > 0) {
      // Sin nombres, cada evento perdería su autor sin avisar: falla todo lo que los usa.
      const perfiles = await filas<{ id: string; full_name: string | null }>(
        db.from('profiles').select('id, full_name').in('id', [...idsPersonas]).abortSignal(s),
        'nombres',
      )
      for (const p of perfiles) if (p.full_name?.trim()) nombres.set(p.id, p.full_name.trim())
    }

    const mapaProcesos = new Map((listaProcesos ?? []).map((p) => [p.id, { meta_ad_name: p.meta_ad_name }]))
    const conRegistro = new Set((listaRegistros ?? []).map((r) => r.deal_id).filter((x): x is string => !!x))
    const eventos = [
      ...(listaRegistros ? eventosDeRegistro(listaRegistros, mapaProcesos) : []),
      ...(listaEtapas ? eventosDeEtapa(listaEtapas, conRegistro, nombres) : []),
      ...(listaTareas ? eventosDeTareas(listaTareas, nombres) : []),
      ...(listaWhatsapp ? eventosDeWhatsapp(listaWhatsapp, nombres) : []),
      ...(listaVideo ? eventosDeVideo(listaVideo) : []),
    ]
    return { eventos, fuentesConError }
  } finally {
    clearTimeout(reloj)
  }
}
