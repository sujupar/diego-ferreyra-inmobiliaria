/**
 * Franja "Página y video" del Tablero: solo lo que está publicado HOY. Módulo puro.
 *
 * Qué está publicado sale de la configuración del A/B (`landing_experiments`):
 *  - apagado ('off') → la ganadora (o la A si no hay ganadora);
 *  - pausado → la A;
 *  - corriendo → las dos (salvo un reparto 0/100).
 * Los videos vigentes son los de `video-keys.ts` que no están retirados y viven
 * en una página publicada. Todo lo demás va a "Ver versiones anteriores".
 */

import { HEATMAP_PAGES } from '@/lib/funnel/heatmap-pages'
import { VIDEO_KEYS, type VideoKeyDef } from '@/lib/funnel/video-keys'
import { normalizeConfig, type ExperimentConfig, type Variant } from '@/lib/funnel/ab-test'
import type { LandingVariante } from '../panel/embudo'
import type { VideoCohorte } from '../panel/video-cohortes'

export function variantesPublicadas(cfg: ExperimentConfig | null | undefined): Variant[] {
  const c = normalizeConfig(cfg)
  if (c.status === 'off') return [c.winner ?? 'A']
  if (c.status === 'paused') return ['A']
  if (c.splitB <= 0) return ['A']
  if (c.splitB >= 100) return ['B']
  return ['A', 'B']
}

/** Páginas (nombre del mapa de calor) publicadas hoy: las variantes vivas de tasación + la clase. */
export function paginasPublicadas(variantes: Variant[]): string[] {
  const out: string[] = []
  for (const def of Object.values(HEATMAP_PAGES)) {
    if (def.funnel === 'tasacion' ? def.variant != null && variantes.includes(def.variant) : true) out.push(def.page)
  }
  return out
}

const DEFS = VIDEO_KEYS as Record<string, VideoKeyDef>

/** ¿Este video es el que se ve hoy en una página publicada? */
export function videoVigente(clave: string, paginas: string[]): boolean {
  const d = DEFS[clave]
  return !!d && !d.retirada && !!d.pagina && paginas.includes(d.pagina)
}

/** ¿Esta fila de conversión por landing es de una versión publicada? */
export function varianteVigente(v: Pick<LandingVariante, 'embudo' | 'variante'>, variantes: Variant[]): boolean {
  if (v.embudo === 'clase') return true
  return variantes.includes(v.variante as Variant)
}

export interface NumerosPagina {
  visitas: number | null
  solicitudes: number | null
  conversion: number | null
  /** Tocaron play ÷ entraron (todas las personas de las páginas publicadas). */
  pctTocaPlay: number | null
  /** % del video visto en promedio (los que no tocaron play cuentan 0). */
  pctVistoRegistrados: number | null
  pctVistoNoRegistrados: number | null
}

/** Números de la franja: SOLO tasación publicada (la clase va en el detalle). */
export function numerosPagina(variantes: LandingVariante[], videos: VideoCohorte[] | null, publicadas: Variant[]): NumerosPagina {
  const vs = variantes.filter(v => v.embudo === 'tasacion' && varianteVigente(v, publicadas))
  const visitas = vs.length ? vs.reduce((a, v) => a + v.visitas, 0) : null
  const solicitudes = vs.length ? vs.reduce((a, v) => a + v.solicitudes, 0) : null
  const paginasTas = paginasPublicadas(publicadas).filter(p => (HEATMAP_PAGES as Record<string, { funnel: string }>)[p]?.funnel === 'tasacion')
  const vids = (videos ?? []).filter(v => videoVigente(v.videoKey, paginasTas))
  const personas = vids.reduce((a, v) => a + v.registrado.personas + v.noRegistrado.personas, 0)
  const play = vids.reduce((a, v) => a + v.registrado.tocaronPlay + v.noRegistrado.tocaronPlay, 0)
  const prom = (g: 'registrado' | 'noRegistrado') => {
    const n = vids.reduce((a, v) => a + v[g].personas, 0)
    if (!n) return null
    return vids.reduce((a, v) => a + (v[g].pctPromTodos ?? 0) * v[g].personas, 0) / n
  }
  return {
    visitas,
    solicitudes,
    conversion: visitas ? (solicitudes ?? 0) / visitas : null,
    pctTocaPlay: videos == null ? null : personas ? play / personas : null,
    pctVistoRegistrados: videos == null ? null : prom('registrado'),
    pctVistoNoRegistrados: videos == null ? null : prom('noRegistrado'),
  }
}
