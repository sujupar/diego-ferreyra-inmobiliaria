/**
 * Baja los datos del panel "Video de bienvenida" (D7) y llama a la lógica pura. SOLO servidor.
 * Columnas mínimas; todo paginado con `todas` (PostgREST corta en 1000 sin avisar).
 */
import 'server-only'
import { db, todas } from './servidor'
import { armarPanelVideoBienvenida, CAMBIO_DESDE, DIAS_ANTES, fechaDelCambio, type EntradaPanelVideo, type PanelVideoBienvenida } from './video-bienvenida'
import type { ContactoRow } from './personas'

export async function cargarPanelVideoBienvenida(ahora: Date): Promise<PanelVideoBienvenida> {
  const sb = db()
  // Los procesos y llamadas que importan son los desde 14 días antes del cambio (o desde el
  // primer enlace, si el cambio todavía no tiene fecha).
  const enlaces = await todas<EntradaPanelVideo['enlaces'][number] & { created_at: string }>((a, b) =>
    sb.from('video_bienvenida_enlaces').select('contact_id, enviado_at, envio_fallido_at, aperturas, created_at').order('codigo').range(a, b))
  const cambio = CAMBIO_DESDE ?? fechaDelCambio(enlaces.map((x) => x.enviado_at))
  const primeros = [
    ...(cambio ? [Date.parse(`${cambio}T03:00:00.000Z`) - DIAS_ANTES * 86_400_000] : []),
    ...enlaces.map((x) => Date.parse(x.created_at) - 86_400_000),
  ]
  const desde = new Date(primeros.length ? Math.min(...primeros) : ahora.getTime()).toISOString()

  const [vistasCrudas, procesos, llamadas, contactos] = await Promise.all([
    todas<EntradaPanelVideo['vistas'][number] & { contact_id: string | null; updated_at: string }>((a, b) =>
      sb.from('video_view_state').select('contact_id, playback_started, watched_buckets, duration_s, updated_at')
        .like('anon_id', 'bv:%').like('video_key', 'bienvenida-tasacion-%').order('id').range(a, b)),
    todas<EntradaPanelVideo['procesos'][number]>((a, b) =>
      sb.from('deals').select('contact_id, origin, stage, created_at, scheduled_at')
        .eq('origin', 'embudo').gte('created_at', desde).order('id').range(a, b)),
    todas<EntradaPanelVideo['llamadas'][number]>((a, b) =>
      sb.from('contact_activities').select('contact_id, call_outcome, occurred_at')
        .eq('kind', 'call').is('voided_at', null).gte('occurred_at', desde).order('id').range(a, b)),
    todas<ContactoRow>((a, b) => sb.from('contacts').select('id, full_name, email, phone').order('id').range(a, b)),
  ])
  // Una vista por persona: la más reciente (cuando cambie el video, -v1 y -v2 no se mezclan).
  const vistas = new Map<string, EntradaPanelVideo['vistas'][number] & { updated_at: string }>()
  for (const v of vistasCrudas) {
    if (!v.contact_id) continue
    const previa = vistas.get(v.contact_id)
    if (!previa || Date.parse(v.updated_at) > Date.parse(previa.updated_at)) vistas.set(v.contact_id, { ...v, contact_id: v.contact_id })
  }
  return armarPanelVideoBienvenida(
    { contactos, enlaces, vistas: [...vistas.values()], procesos, llamadas, cambioDesde: cambio },
    ahora,
  )
}
