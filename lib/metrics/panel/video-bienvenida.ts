/**
 * Panel "Video de bienvenida" de /metrics (tasacion-video-bienvenida, D7). Puro.
 *
 * Una persona por contacto, sin datos de prueba. Lo que se mide del video sale de los TRAMOS
 * (adelantar no suma). "Atendió" y "coordinó" son las dos preguntas del dueño: ¿el video hace
 * que atiendan la llamada de Paula y que se coordine la tasación?
 *
 * OJO al leer el antes/después: las llamadas se registran recién desde el 26/11/2026, así que
 * "atendió" antes del cambio tiene base mínima. "Coordinó" sí se compara completo.
 */
import { contactosDePrueba, type ContactoRow } from './personas'
import { contarTramos, formatoMinutos, segundosVistos } from '@/lib/video-bienvenida/tramos'

/** Día en que la plantilla con video empezó a salir (hora de Argentina). Se carga al activarla. */
export const CAMBIO_DESDE: string | null = null
export const DIAS_ANTES = 14
export const BASE_CHICA = 20

/** Coordinada en adelante (valores de `deals.stage`, 20260506000001). `lost` cuenta solo con `scheduled_at`. */
const ETAPAS_COORDINADAS = new Set(['scheduled', 'not_visited', 'visited', 'appraisal_sent', 'followup', 'captured'])
const ATENDIO = new Set(['agendo', 'volver_a_llamar', 'no_interesa'])

export interface EntradaPanelVideo {
  contactos: ContactoRow[]
  enlaces: { contact_id: string; enviado_at: string | null; envio_fallido_at: string | null; aperturas: number }[]
  vistas: { contact_id: string; playback_started: boolean | null; watched_buckets: string | null; duration_s: number | null }[]
  procesos: { contact_id: string | null; origin: string | null; stage: string | null; created_at: string; scheduled_at: string | null }[]
  llamadas: { contact_id: string; call_outcome: string | null; occurred_at: string }[]
  cambioDesde: string | null
}

export type Grupo = 'vio' | 'abrio' | 'no_abrio'
export interface ConteoGrupo { personas: number; atendio: number; coordino: number }

export interface PanelVideoBienvenida {
  resumen: { recibieron: number; abrieron: number; tocaronPlay: number; mitadOMas: number; baseChica: boolean }
  grupos: (ConteoGrupo & { grupo: Grupo })[]
  antesDespues: { antes: ConteoGrupo; despues: ConteoGrupo; desde: string } | null
  personas: {
    nombre: string
    enviado: string
    aperturas: number
    minutos: string | null
    porcentaje: number | null
    atendio: boolean
    coordino: boolean
  }[]
}

const ms = (iso: string) => Date.parse(iso)
/** Inicio del día en Argentina (UTC−3, sin horario de verano). */
const inicioDiaAr = (fecha: string) => ms(`${fecha}T03:00:00.000Z`)

function coordinado(p: EntradaPanelVideo['procesos'][number]): boolean {
  return p.scheduled_at !== null || (p.stage !== null && ETAPAS_COORDINADAS.has(p.stage))
}

export function armarPanelVideoBienvenida(e: EntradaPanelVideo, ahora: Date): PanelVideoBienvenida {
  const prueba = contactosDePrueba(e.contactos).ids
  const nombres = new Map(e.contactos.map((c) => [c.id, c.full_name?.trim() || 'Sin nombre']))
  const vista = new Map(e.vistas.map((v) => [v.contact_id, v]))
  const delEmbudo = e.procesos.filter((p) => p.origin === 'embudo' && p.contact_id && !prueba.has(p.contact_id))
  const llamadasDe = new Map<string, EntradaPanelVideo['llamadas']>()
  for (const l of e.llamadas) llamadasDe.set(l.contact_id, [...(llamadasDe.get(l.contact_id) ?? []), l])

  const atendioDesde = (contacto: string, desde: number) =>
    (llamadasDe.get(contacto) ?? []).some((l) => ms(l.occurred_at) >= desde && l.call_outcome !== null && ATENDIO.has(l.call_outcome))
  const coordinoDesde = (contacto: string, desde: number) =>
    delEmbudo.some((p) => p.contact_id === contacto && ms(p.created_at) >= desde - 5 * 60_000 && coordinado(p))

  // Recibieron: enlace que salió por WhatsApp y Meta no avisó que falló.
  const recibidos = e.enlaces.filter((x) => x.enviado_at && !x.envio_fallido_at && !prueba.has(x.contact_id))
  const personas = recibidos.map((x) => {
    const v = vista.get(x.contact_id)
    const enviado = x.enviado_at!
    // El proceso nace segundos antes del envío: se toma desde 5 min antes.
    const desde = ms(enviado) - 5 * 60_000
    const tramos = v?.playback_started ? contarTramos(v.watched_buckets) : null
    return {
      contacto: x.contact_id,
      grupo: (v?.playback_started ? 'vio' : x.aperturas > 0 ? 'abrio' : 'no_abrio') as Grupo,
      fila: {
        nombre: nombres.get(x.contact_id) ?? 'Sin nombre',
        enviado,
        aperturas: x.aperturas,
        minutos: v?.playback_started && v.duration_s ? formatoMinutos(segundosVistos(v.watched_buckets, v.duration_s)) : null,
        porcentaje: tramos,
        atendio: atendioDesde(x.contact_id, desde),
        coordino: coordinoDesde(x.contact_id, desde),
      },
    }
  })

  const contar = (lista: typeof personas): ConteoGrupo => ({
    personas: lista.length,
    atendio: lista.filter((p) => p.fila.atendio).length,
    coordino: lista.filter((p) => p.fila.coordino).length,
  })
  const grupos = (['vio', 'abrio', 'no_abrio'] as const).map((g) => ({ grupo: g, ...contar(personas.filter((p) => p.grupo === g)) }))

  let antesDespues: PanelVideoBienvenida['antesDespues'] = null
  if (e.cambioDesde) {
    const corte = inicioDiaAr(e.cambioDesde)
    const inicio = corte - DIAS_ANTES * 86_400_000
    const porContacto = (desde: number, hasta: number): ConteoGrupo => {
      const primeros = new Map<string, number>()
      for (const p of delEmbudo) {
        const t = ms(p.created_at)
        if (t < desde || t >= hasta) continue
        const previo = primeros.get(p.contact_id!)
        if (previo === undefined || t < previo) primeros.set(p.contact_id!, t)
      }
      const ids = [...primeros.entries()]
      return {
        personas: ids.length,
        atendio: ids.filter(([c, t]) => atendioDesde(c, t)).length,
        coordino: ids.filter(([c, t]) => coordinoDesde(c, t)).length,
      }
    }
    antesDespues = { antes: porContacto(inicio, corte), despues: porContacto(corte, ahora.getTime() + 1), desde: e.cambioDesde }
  }

  const abrieron = personas.filter((p) => p.grupo !== 'no_abrio').length
  const tocaronPlay = personas.filter((p) => p.grupo === 'vio').length
  const mitadOMas = personas.filter((p) => (p.fila.porcentaje ?? 0) >= 50).length
  return {
    resumen: { recibieron: personas.length, abrieron, tocaronPlay, mitadOMas, baseChica: personas.length < BASE_CHICA },
    grupos,
    antesDespues,
    personas: personas.map((p) => p.fila).sort((a, b) => ms(b.enviado) - ms(a.enviado)),
  }
}
