/**
 * Catálogo ÚNICO de las páginas que tienen mapa de calor. Módulo puro.
 *
 * POR QUÉ EXISTE: esta lista estaba copiada a mano en cuatro lugares —la API de
 * lectura, la página del visor, el panel resumen y la API de métricas— y en los
 * cuatro faltaba la landing B de tasación. La B registraba su calor como
 * `tasacion-neta` desde el 2026-09-15 y se juntaron 59 sesiones que nadie podía
 * ver: el dato se guardaba, ninguna pantalla lo pedía y nada fallaba. Ahora los
 * cuatro leen de acá, y `heatmap-pages.test.ts` compara este catálogo contra el
 * código de cada landing para que no vuelva a pasar en silencio.
 *
 * `page` es el nombre con el que la landing REGISTRA (`<FunnelHeatmapTracker
 * page="…">`) y por lo tanto el valor de la columna `page` en la base. No se
 * puede renombrar sin migrar los datos ya guardados.
 */

export type HeatmapFunnel = 'tasacion' | 'clase'

export interface HeatmapPageDef {
  /** Nombre con el que la landing registra su calor. Clave en la base y en la URL del visor. */
  page: string
  /** Embudo al que pertenece (la `key` de las tarjetas de /embudos). */
  funnel: HeatmapFunnel
  /** Variante del A/B, o null si esa landing no tiene versiones. */
  variant: 'A' | 'B' | null
  /** Título de la pantalla del visor. */
  label: string
  /** Etiqueta corta para el selector de versión. */
  tabLabel: string
  /** Ruta pública de la landing. */
  slug: string
  /** Secciones `data-hm` de la landing, en el orden en que aparecen en la página. */
  sections: readonly string[]
}

export const HEATMAP_PAGES = {
  tasacion: {
    page: 'tasacion',
    funnel: 'tasacion',
    variant: 'A',
    label: 'Tasación Directa · Versión A (actual)',
    tabLabel: 'Versión A · Actual',
    slug: 'tasacion-directa',
    sections: ['topbar', 'hero', 'benefits', 'stat', 'testimonios', 'cta-final', 'footer'],
  },
  'tasacion-neta': {
    page: 'tasacion-neta',
    funnel: 'tasacion',
    variant: 'B',
    label: 'Tasación Directa · Versión B (Tasación Neta)',
    tabLabel: 'Versión B · Tasación Neta',
    slug: 'tasacion-directa',
    sections: ['logo', 'hero', 'video', 'qualifier', 'cta-1', 'testimonios', 'cta-final', 'footer'],
  },
  clase: {
    page: 'clase',
    funnel: 'clase',
    variant: null,
    label: 'Clase Gratuita',
    tabLabel: 'Clase Gratuita',
    slug: 'vsl-clase-propietarios',
    sections: ['topbar', 'hero', 'social-proof', 'bio', 'cta-final', 'footer'],
  },
} as const satisfies Record<string, HeatmapPageDef>

export type HeatmapPageKey = keyof typeof HEATMAP_PAGES

/**
 * ¿Es una página del catálogo? Se usa `Object.hasOwn` y no `in`: el valor viene
 * de la URL, y con `in` claves como `constructor` o `toString` darían verdadero.
 */
export function isHeatmapPageKey(page: string | null | undefined): page is HeatmapPageKey {
  return typeof page === 'string' && Object.hasOwn(HEATMAP_PAGES, page)
}

/** La definición de una página, o null si no está en el catálogo. */
export function heatmapPage(page: string | null | undefined): HeatmapPageDef | null {
  return isHeatmapPageKey(page) ? HEATMAP_PAGES[page] : null
}

/** Las páginas de un embudo, con la A antes que la B. [] si el embudo no tiene calor. */
export function heatmapPagesOfFunnel(funnel: string): HeatmapPageDef[] {
  return (Object.values(HEATMAP_PAGES) as HeatmapPageDef[])
    .filter((p) => p.funnel === funnel)
    .sort((a, b) => (a.variant ?? '').localeCompare(b.variant ?? ''))
}

/**
 * Dirección que carga el visor dentro del iframe.
 *
 * - `hm_preview=1` NO es opcional: apaga el registro de la visita
 *   (`LandingVisitTracker`) y el del calor (`FunnelHeatmapTracker`). Sin eso, cada
 *   vez que el dueño mira el mapa se cuenta a sí mismo como visitante.
 * - `lp=A|B` fuerza la variante. El A/B reparte POR CLIC: sin forzarla, el iframe
 *   cargaría una versión al azar y pintaría el calor de una encima de la otra.
 */
export function heatmapPreviewSrc(def: HeatmapPageDef): string {
  return `/${def.slug}?hm_preview=1${def.variant ? `&lp=${def.variant}` : ''}`
}

const SECTION_LABELS: Record<string, string> = {
  topbar: 'Barra superior',
  logo: 'Logo',
  hero: 'Hero (video + título)',
  video: 'Video',
  qualifier: 'Para quién es',
  'cta-1': 'Botón bajo el video',
  benefits: 'Beneficios',
  stat: 'Estadística',
  testimonios: 'Testimonios',
  'social-proof': 'Prueba social',
  bio: 'Quién soy',
  'cta-final': 'CTA final',
  footer: 'Pie',
}

/** Nombre en castellano de una sección; si no la conoce, devuelve la clave tal cual. */
export function sectionLabel(section: string): string {
  return Object.hasOwn(SECTION_LABELS, section) ? SECTION_LABELS[section] : section
}
