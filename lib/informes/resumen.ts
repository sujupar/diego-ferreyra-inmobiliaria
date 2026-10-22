/**
 * El resumen del informe, qué páginas salen y qué falta completar (spec 2026-10-22). Puro.
 *
 * Regla que manda en todo el módulo (criterio 10 del spec): un dato que no se pudo traer o que
 * falta cargar NUNCA cuenta como 0 — el total queda sin valor y dice qué falta. Un 0 cargado a
 * mano sí es un 0. Una fuente `sin_datos` (no hay aviso en ese portal, no hubo campaña) no suma
 * ni falta: no hay nada que contar.
 */
import type { FuenteGuardada, Informe, Manual, Fuentes } from './tipos'

export interface Total { valor: number | null; faltan: string[] }

export interface Resumen {
  /** Apariciones en búsquedas: exposición de Zonaprop + visualizaciones de Argenprop + visitas de ML. */
  vieron: Total
  /** Entraron al aviso: visualizaciones de Zonaprop + Argenprop + visitas de ML. */
  entraron: Total
  consultas: number | null
  visitas: number | null
  reserva: boolean | null
}

type Termino = { valor: number } | { omitir: true } | { falta: string }

function sumar(terminos: Termino[]): Total {
  const faltan = terminos.flatMap(t => ('falta' in t ? [t.falta] : []))
  if (faltan.length) return { valor: null, faltan }
  return { valor: terminos.reduce((s, t) => s + ('valor' in t ? t.valor : 0), 0), faltan: [] }
}

function deMercadoLibre(f: Fuentes['mercadolibre']): Termino {
  if (!f || f.estado === 'pendiente') return { falta: 'Visitas de MercadoLibre (todavía no se trajeron)' }
  if (f.estado === 'error') return { falta: 'Visitas de MercadoLibre (no se pudo traer)' }
  if (f.estado === 'sin_datos' || !f.datos) return { omitir: true }
  return { valor: f.datos.visitas }
}

function deManual(publicado: boolean | undefined, valor: number | undefined, falta: string): Termino {
  if (publicado === false) return { omitir: true }
  return typeof valor === 'number' ? { valor } : { falta }
}

function datosOk<T>(f: FuenteGuardada<T> | undefined): T | null {
  return f && f.estado === 'ok' ? f.datos : null
}

export function resumenDeMetricas(fuentes: Fuentes, manual: Manual): Resumen {
  const zp = manual.zonaprop ?? {}
  const ap = manual.argenprop ?? {}
  const ml = deMercadoLibre(fuentes.mercadolibre)
  const apVistas = deManual(ap.publicado, ap.visualizaciones, 'Visualizaciones de Argenprop')
  return {
    vieron: sumar([deManual(zp.publicado, zp.exposicion, 'Exposición de Zonaprop'), apVistas, ml]),
    entraron: sumar([deManual(zp.publicado, zp.visualizaciones, 'Visualizaciones de Zonaprop'), apVistas, ml]),
    consultas: datosOk(fuentes.consultas)?.total ?? null,
    visitas: datosOk(fuentes.visitas)?.realizadas ?? null,
    reserva: datosOk(fuentes.reserva)?.reservada ?? null,
  }
}

export function valorDelM2(precio: number | null, m2: number | null): number | null {
  if (!precio || !m2 || m2 <= 0) return null
  return Math.round(precio / m2)
}

export type Pagina =
  | 'portada' | 'resumen' | 'comencemos' | 'divisor-publicidad' | 'portales' | 'meta' | 'organico'
  | 'divisor-consultas' | 'consultas' | 'divisor-visitas' | 'ficha-visitas' | 'divisor-competencia'
  | `competidoras-${number}` | 'analisis' | 'gracias' | 'contacto'

const COMPETIDORAS_POR_PAGINA = 2

/** El orden de los informes de ejemplo. Un canal sin datos no sale (como Meta en Entre Ríos). */
export function paginasDelInforme(i: Informe): Pagina[] {
  const p: Pagina[] = ['portada', 'resumen', 'comencemos', 'divisor-publicidad', 'portales']
  const meta = datosOk(i.fuentes.meta)
  if (meta && meta.campanas > 0) p.push('meta')
  const reels = datosOk(i.fuentes.instagram)?.reels.length ?? 0
  if (reels > 0 || typeof i.manual.tiktok?.visualizaciones === 'number') p.push('organico')
  p.push('divisor-consultas', 'consultas', 'divisor-visitas', 'ficha-visitas')
  if (i.competidoras.length) {
    p.push('divisor-competencia')
    const paginas = Math.ceil(i.competidoras.length / COMPETIDORAS_POR_PAGINA)
    for (let n = 1; n <= paginas; n++) p.push(`competidoras-${n}`)
  }
  if (i.manual.textos?.analisisFinal?.trim()) p.push('analisis')
  p.push('gracias', 'contacto')
  return p
}

export function competidorasDeLaPagina<T>(competidoras: T[], n: number): T[] {
  return competidoras.slice((n - 1) * COMPETIDORAS_POR_PAGINA, n * COMPETIDORAS_POR_PAGINA)
}

const NOMBRE_FUENTE: Record<keyof Fuentes, string> = {
  consultas: 'Consultas', visitas: 'Visitas', reserva: 'Reserva', mercadolibre: 'MercadoLibre', meta: 'Meta Ads', instagram: 'Instagram',
}

/** Lo que bloquea "Marcar como listo", en el orden de la pantalla. */
export function faltantes(i: Informe): string[] {
  const f: string[] = []
  for (const nombre of Object.keys(NOMBRE_FUENTE) as Array<keyof Fuentes>) {
    const fuente = i.fuentes[nombre]
    if (!fuente || fuente.estado === 'pendiente') f.push(`${NOMBRE_FUENTE[nombre]}: todavía no se trajo`)
    else if (fuente.estado === 'error') f.push(`${NOMBRE_FUENTE[nombre]}: no se pudo traer (reintentar)`)
  }
  const zp = i.manual.zonaprop ?? {}
  if (zp.publicado !== false) {
    if (typeof zp.exposicion !== 'number' && typeof zp.visualizaciones !== 'number') {
      f.push('Zonaprop: exposición y visualizaciones (o marcar que no está publicada)')
    } else {
      if (typeof zp.exposicion !== 'number') f.push('Zonaprop: exposición')
      if (typeof zp.visualizaciones !== 'number') f.push('Zonaprop: visualizaciones')
    }
  }
  const ap = i.manual.argenprop ?? {}
  if (ap.publicado !== false && typeof ap.visualizaciones !== 'number') {
    f.push('Argenprop: visualizaciones (o marcar que no está publicada)')
  }
  if (!i.manual.textos?.accionesRealizadas?.trim()) f.push('Acciones realizadas')
  if (!i.manual.textos?.accionesARealizar?.trim()) f.push('Acciones a realizar')
  return f
}
