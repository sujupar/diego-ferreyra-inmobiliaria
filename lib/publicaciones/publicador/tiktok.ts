/**
 * La etapa de TikTok: iniciar la subida a borradores, mandar las partes que
 * entran antes del plazo y esperar a que TikTok lo pase a la bandeja de la app.
 * Sin red ni base (así se prueba).
 *
 * Contra el duplicado: con una subida en curso, primero se le pregunta a TikTok
 * en qué quedó. Solo se inicia otra si la anterior venció SIN completarse o si
 * TikTok la rechazó y la persona tocó "Reintentar". Un video a medio subir no
 * llega nunca a la bandeja: no hay borrador doble.
 */
import { planDePartes, type EstadoTiktok } from '@/lib/integrations/tiktok/subida'
import { PLAZO_VENCIDO, vencioElPlazo, type Contexto, type EnvioEnCurso, type Pieza, type ResultadoEtapa } from './redes'

const TECHO_OPERACION_MS = 4_000
const TECHO_MINIMO_MS = 1_500
const PLAZO_POR_DEFECTO_MS = 12_000
/** TikTok da una hora para subir las partes; se deja margen. */
const VIGENCIA_SUBIDA_MS = 55 * 60_000
const UN_MINUTO = 60_000
const LISTOS = new Set(['SEND_TO_USER_INBOX', 'PUBLISH_COMPLETE'])

export interface DepsTiktok {
  ahora(): number
  iniciar(a: { total: number; tamanoParte: number; cantidad: number }): Promise<{ publishId: string; uploadUrl: string }>
  estado(publishId: string): Promise<{ status: EstadoTiktok; motivo: string | null }>
  leerParte(videoUrl: string, desde: number, hasta: number, techoMs: number): Promise<Uint8Array<ArrayBuffer>>
  subirParte(url: string, desde: number, bytes: Uint8Array<ArrayBuffer>, total: number, techoMs: number, tipo: string): Promise<'parcial' | 'completa'>
}

export async function avanzarTiktok(envio: EnvioEnCurso, pieza: Pieza, d: DepsTiktok, ctx: Contexto): Promise<ResultadoEtapa> {
  const total = pieza.tamanoBytes ?? 0
  if (!total) return { etapa: envio.etapa, ids: envio.ids_externos, estado: 'fallido', error: 'No se sabe cuánto pesa el video: volvé a subirlo.' }
  const plan = planDePartes(total)
  const plazo = ctx.plazo ?? d.ahora() + PLAZO_POR_DEFECTO_MS
  const reintento = envio.ids_externos.reintento === true
  let ids: Record<string, unknown> = { ...envio.ids_externos }
  delete ids.reintento

  let siguiente = typeof ids.siguiente === 'number' ? ids.siguiente : 0
  const publishId = typeof ids.publish_id === 'string' ? ids.publish_id : null
  let arrancar = !publishId

  if (publishId) {
    const e = await d.estado(publishId)
    if (LISTOS.has(e.status)) return { etapa: 'procesando', ids, estado: 'publicado', enlace: null }
    if (e.status === 'FAILED') {
      if (!reintento) {
        return { etapa: envio.etapa, ids, estado: 'fallido', error: `TikTok no aceptó el video${e.motivo ? ` (${e.motivo})` : ''}. Revisalo y tocá Reintentar.` }
      }
      arrancar = true
    } else if (vencioElPlazo(ids, ctx.ahora)) {
      return { etapa: envio.etapa, ids, estado: 'fallido', error: PLAZO_VENCIDO('TikTok') }
    } else if (siguiente >= plan.cantidad) {
      // Ya subió todo: TikTok lo está procesando.
      return { etapa: 'procesando', ids, estado: 'en_curso', esperarMs: UN_MINUTO }
    } else {
      const iniciado = typeof ids.iniciado_at === 'string' ? Date.parse(ids.iniciado_at) : NaN
      // Una subida a medias que venció nunca va a llegar a la bandeja: se arranca otra.
      if (!Number.isFinite(iniciado) || d.ahora() - iniciado > VIGENCIA_SUBIDA_MS) arrancar = true
    }
  }

  if (arrancar) {
    const nueva = await d.iniciar({ total, tamanoParte: plan.tamanoParte, cantidad: plan.cantidad })
    ids = {
      publish_id: nueva.publishId,
      upload_url: nueva.uploadUrl,
      iniciado_at: new Date(d.ahora()).toISOString(),
      inicio_at: typeof ids.inicio_at === 'string' ? ids.inicio_at : ctx.ahora.toISOString(),
    }
    siguiente = 0
    // ANTES del primer byte: con la subida guardada, un corte no inicia un segundo borrador.
    await ctx.anotarIds?.('subiendo', { ...ids, siguiente })
  }

  const url = ids.upload_url as string
  let subidas = 0
  while (siguiente < plan.cantidad) {
    const restante = plazo - d.ahora()
    if (subidas > 0 && restante < 2 * TECHO_OPERACION_MS) break
    if (subidas === 0 && restante < 2 * TECHO_MINIMO_MS) break
    const techo = Math.min(TECHO_OPERACION_MS, Math.max(TECHO_MINIMO_MS, Math.floor(restante / 2)))
    const { desde, hasta } = plan.partes[siguiente]
    let r: 'parcial' | 'completa'
    try {
      const bytes = await d.leerParte(pieza.videoUrl, desde, hasta, techo)
      if (bytes.length !== hasta - desde + 1) throw new Error('No se pudo leer una parte completa del video')
      r = await d.subirParte(url, desde, bytes, total, techo, pieza.videoUrl.endsWith('.mov') ? 'video/quicktime' : 'video/mp4')
    } catch (e) {
      // Lo subido hasta acá queda anotado: la corrida siguiente sigue desde ahí, no desde el principio.
      if (subidas > 0) await ctx.anotarIds?.('subiendo', { ...ids, siguiente })
      throw e
    }
    siguiente++
    subidas++
    if (r === 'completa') siguiente = plan.cantidad
  }
  const termino = siguiente >= plan.cantidad
  return {
    etapa: termino ? 'procesando' : 'subiendo',
    ids: { ...ids, siguiente },
    estado: 'en_curso',
    esperarMs: termino ? 30_000 : 0,
  }
}
