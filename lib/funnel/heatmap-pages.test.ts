/**
 * Catálogo de páginas con mapa de calor.
 *
 * El bug que estas pruebas clavan (2026-09-15 → 2026-09-19): la landing B de
 * tasación GUARDABA su calor con el nombre `tasacion-neta`, pero la lista de
 * páginas estaba copiada a mano en cuatro archivos y en ninguno figuraba la B.
 * Se juntaron 59 sesiones y 50 clics que nadie podía ver, y nada falló ni avisó.
 * Es el clásico "se cambió el productor y se olvidó el consumidor".
 *
 * La prueba más importante es la última: compara el catálogo contra el CÓDIGO
 * de cada landing. Si alguien agrega una landing, le cambia el nombre con el que
 * registra, o le agrega/saca una sección, esto se pone rojo.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  HEATMAP_PAGES,
  heatmapPage,
  heatmapPagesOfFunnel,
  heatmapPreviewSrc,
  heatmapRealHref,
  isHeatmapPageKey,
  sectionLabel,
} from './heatmap-pages'

describe('heatmapPage', () => {
  it('conoce las tres páginas que hoy registran calor', () => {
    expect(Object.keys(HEATMAP_PAGES).sort()).toEqual(['clase', 'tasacion', 'tasacion-neta'])
  })

  it('la B de tasación existe y es la variante B del embudo de tasación', () => {
    const b = heatmapPage('tasacion-neta')
    expect(b).not.toBeNull()
    expect(b?.funnel).toBe('tasacion')
    expect(b?.variant).toBe('B')
    expect(b?.slug).toBe('tasacion-directa')
  })

  it('una página desconocida o rara da null (el visor responde 404, la API 400)', () => {
    for (const mala of ['', 'tasacion-b', 'TASACION', '../etc', 'tasacion ', 'constructor', '__proto__', 'toString']) {
      expect(heatmapPage(mala)).toBeNull()
      expect(isHeatmapPageKey(mala)).toBe(false)
    }
    expect(heatmapPage(null)).toBeNull()
    expect(heatmapPage(undefined)).toBeNull()
  })
})

describe('heatmapPagesOfFunnel', () => {
  it('tasación tiene dos versiones, en orden A y después B', () => {
    expect(heatmapPagesOfFunnel('tasacion').map((p) => p.page)).toEqual(['tasacion', 'tasacion-neta'])
    expect(heatmapPagesOfFunnel('tasacion').map((p) => p.variant)).toEqual(['A', 'B'])
  })

  it('la clase tiene una sola, sin variante', () => {
    const paginas = heatmapPagesOfFunnel('clase')
    expect(paginas.map((p) => p.page)).toEqual(['clase'])
    expect(paginas[0].variant).toBeNull()
  })

  it('un embudo desconocido no tiene páginas', () => {
    expect(heatmapPagesOfFunnel('comprador')).toEqual([])
  })
})

describe('heatmapPreviewSrc — la dirección que carga el visor', () => {
  it('SIEMPRE lleva hm_preview=1: sin eso, mirar el mapa contaría como visita y como sesión de calor', () => {
    for (const p of Object.values(HEATMAP_PAGES)) {
      expect(heatmapPreviewSrc(p)).toMatch(/[?&]hm_preview=1(&|$)/)
    }
  })

  it('cada versión de tasación fuerza SU variante: el A/B reparte por clic y sin forzar saldría una al azar', () => {
    expect(heatmapPreviewSrc(HEATMAP_PAGES.tasacion)).toBe('/tasacion-directa?hm_preview=1&lp=A')
    expect(heatmapPreviewSrc(HEATMAP_PAGES['tasacion-neta'])).toBe('/tasacion-directa?hm_preview=1&lp=B')
  })

  it('la clase no tiene variantes que forzar', () => {
    expect(heatmapPreviewSrc(HEATMAP_PAGES.clase)).toBe('/vsl-clase-propietarios?hm_preview=1')
  })
})

describe('heatmapRealHref — el botón "Abrir la landing real" del visor', () => {
  it('NUNCA lleva hm_preview: es la dirección para probar el formulario de verdad', () => {
    // Si el dueño abre el marco del visor en otra pestaña, la dirección conserva hm_preview=1 y
    // el formulario sigue frenado. Este enlace es la salida limpia.
    for (const p of Object.values(HEATMAP_PAGES)) expect(heatmapRealHref(p)).not.toMatch(/hm_preview/)
  })

  it('en tasación fuerza la versión que se estaba mirando; en la clase va pelada', () => {
    expect(heatmapRealHref(HEATMAP_PAGES.tasacion)).toBe('/tasacion-directa?lp=A')
    expect(heatmapRealHref(HEATMAP_PAGES['tasacion-neta'])).toBe('/tasacion-directa?lp=B')
    expect(heatmapRealHref(HEATMAP_PAGES.clase)).toBe('/vsl-clase-propietarios')
  })
})

describe('sectionLabel', () => {
  it('toda sección del catálogo tiene un nombre en castellano (no se muestra la clave cruda)', () => {
    for (const p of Object.values(HEATMAP_PAGES)) {
      for (const s of p.sections) {
        expect(sectionLabel(s), `${p.page} → ${s}`).not.toBe(s)
      }
    }
  })

  it('una sección que no conoce se muestra tal cual, no explota', () => {
    expect(sectionLabel('seccion-nueva')).toBe('seccion-nueva')
    expect(sectionLabel('constructor')).toBe('constructor')
  })

  it('el "hero" se llama distinto en cada versión, porque ES distinto', () => {
    // En la A el video está adentro del hero. En la B el video es una sección aparte:
    // decirle "Hero (video + título)" mostraría 4 clics al lado de los 26 del Video.
    expect(sectionLabel('hero', 'tasacion')).toBe('Hero (video + título)')
    expect(sectionLabel('hero', 'tasacion-neta')).toBe('Título y texto')
    expect(sectionLabel('hero', 'tasacion-neta')).not.toMatch(/video/i)
  })
})

describe('el catálogo coincide con el CÓDIGO de cada landing', () => {
  const RAIZ = join(__dirname, '..', '..')
  const LANDINGS: Record<string, string> = {
    tasacion: 'app/(funnels)/tasacion-directa/TasacionClient.tsx',
    'tasacion-neta': 'app/(funnels)/tasacion-directa/TasacionNetaClient.tsx',
    clase: 'app/(funnels)/vsl-clase-propietarios/ClaseClient.tsx',
  }

  /** El código sin comentarios: una sección nombrada en un comentario no es una sección. */
  const sinComentarios = (txt: string) =>
    txt.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  for (const [page, archivo] of Object.entries(LANDINGS)) {
    const fuente = sinComentarios(readFileSync(join(RAIZ, archivo), 'utf8'))

    it(`${page}: la landing registra su calor con ese mismo nombre`, () => {
      const m = fuente.match(/<FunnelHeatmapTracker\s+page="([^"]+)"\s+funnel="([^"]+)"/)
      expect(m, 'no encontré el <FunnelHeatmapTracker page="…" funnel="…">').not.toBeNull()
      expect(m?.[1]).toBe(page)
      expect(m?.[2]).toBe(HEATMAP_PAGES[page as keyof typeof HEATMAP_PAGES].funnel)
    })

    it(`${page}: las secciones del catálogo son las data-hm de la landing, en el mismo orden`, () => {
      const enLaLanding = [...fuente.matchAll(/data-hm="([^"]+)"/g)].map((x) => x[1])
      expect(HEATMAP_PAGES[page as keyof typeof HEATMAP_PAGES].sections).toEqual(enLaLanding)
    })
  }

  it('TODA landing de app/(funnels) que registre calor está en el catálogo, y viceversa', () => {
    // Se recorre la carpeta entera, no una lista fija: si mañana aparece una landing C
    // (otro archivo, otro nombre de página), esto se pone rojo hasta que se la sume acá.
    const archivos: string[] = []
    const recorrer = (dir: string) => {
      for (const nombre of readdirSync(dir)) {
        const ruta = join(dir, nombre)
        if (statSync(ruta).isDirectory()) recorrer(ruta)
        else if (/\.tsx$/.test(nombre) && !/\.test\.tsx$/.test(nombre)) archivos.push(ruta)
      }
    }
    recorrer(join(RAIZ, 'app', '(funnels)'))
    const registran = archivos.flatMap((a) =>
      [...sinComentarios(readFileSync(a, 'utf8')).matchAll(/<FunnelHeatmapTracker\s[^>]*?page=(?:"([^"]+)"|\{[^}]*\})/g)].map((x) => x[1] ?? '(dinámico)'),
    )
    expect(registran.length).toBeGreaterThan(0)
    for (const n of registran) expect(isHeatmapPageKey(n), `una landing registra calor como "${n}"`).toBe(true)
    expect([...new Set(registran)].sort()).toEqual(Object.keys(HEATMAP_PAGES).sort())
  })
})
