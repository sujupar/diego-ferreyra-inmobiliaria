/**
 * Claves con las que cada landing registra las estadísticas de SU video.
 *
 * El bug que estas pruebas clavan (2026-09-15 → 2026-09-19): las landings A y B de
 * tasación registraban su video con la MISMA clave (`hero-tasacion`), siendo dos
 * videos distintos (196 s y 711 s). En la base el video se guarda una fila por
 * (persona, clave), así que Embudos mostraba UN solo bloque "Video del hero" con la
 * retención de los dos videos mezclada — justo el dato que más importa para comparar
 * las dos versiones del test A/B. Nada fallaba: la B se había armado copiando la A.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, it, expect } from 'vitest'
import { VIDEO_KEYS, videoLabel, ordenarClavesDeVideo } from './video-keys'

const RAIZ = join(__dirname, '..', '..')

/** Todos los `trackKey="…"` de las landings, con el archivo donde aparecen. */
function clavesEnLasLandings(): { clave: string; archivo: string }[] {
  const sinComentarios = (t: string) =>
    t.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const archivos: string[] = []
  const recorrer = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const ruta = join(dir, n)
      if (statSync(ruta).isDirectory()) recorrer(ruta)
      else if (/\.tsx$/.test(n) && !/\.test\.tsx$/.test(n)) archivos.push(ruta)
    }
  }
  recorrer(join(RAIZ, 'app', '(funnels)'))
  return archivos.flatMap((a) =>
    [...sinComentarios(readFileSync(a, 'utf8')).matchAll(/\btrackKey=(?:"([^"]+)"|'([^']+)'|\{[^}]*\})/g)].map((m) => ({
      clave: m[1] ?? m[2] ?? '(dinámica)',
      archivo: relative(RAIZ, a),
    })),
  )
}

describe('claves de video de las landings', () => {
  const usadas = clavesEnLasLandings()

  it('hay landings con video (si esto da 0, la prueba dejó de leer el código)', () => {
    expect(usadas.length).toBeGreaterThanOrEqual(4)
  })

  it('NINGUNA clave se repite entre dos landings: cada video tiene la suya', () => {
    const porClave = new Map<string, string[]>()
    for (const u of usadas) porClave.set(u.clave, [...(porClave.get(u.clave) ?? []), u.archivo])
    const repetidas = [...porClave.entries()].filter(([, archivos]) => archivos.length > 1)
    expect(repetidas, 'dos landings registran su video con la misma clave: sus estadísticas se mezclan').toEqual([])
  })

  it('toda clave usada está en el catálogo, y el catálogo no tiene claves que nadie use', () => {
    expect(usadas.map((u) => u.clave).sort()).toEqual(Object.keys(VIDEO_KEYS).sort())
  })

  it('las dos versiones de tasación tienen claves y nombres distintos, y el nombre dice cuál es', () => {
    expect(VIDEO_KEYS['hero-tasacion'].label).not.toBe(VIDEO_KEYS['hero-tasacion-neta'].label)
    expect(VIDEO_KEYS['hero-tasacion'].label).toMatch(/Versión A/)
    expect(VIDEO_KEYS['hero-tasacion-neta'].label).toMatch(/Versión B/)
  })
})

describe('videoLabel', () => {
  it('devuelve el nombre en castellano', () => {
    expect(videoLabel('hero-clase')).toBe(VIDEO_KEYS['hero-clase'].label)
  })

  it('una clave que no conoce se muestra tal cual, no explota (incluye claves raras)', () => {
    expect(videoLabel('video-nuevo')).toBe('video-nuevo')
    expect(videoLabel('constructor')).toBe('constructor')
    expect(videoLabel('__proto__')).toBe('__proto__')
  })
})

describe('ordenarClavesDeVideo', () => {
  it('pone la Versión A antes que la B, sin importar el orden en que lleguen de la base', () => {
    expect(ordenarClavesDeVideo(['hero-tasacion-neta', 'hero-tasacion'])).toEqual(['hero-tasacion', 'hero-tasacion-neta'])
  })

  it('las claves que no conoce van al final, en el orden en que llegaron', () => {
    expect(ordenarClavesDeVideo(['zzz', 'hero-tasacion-neta', 'aaa', 'hero-tasacion'])).toEqual([
      'hero-tasacion', 'hero-tasacion-neta', 'zzz', 'aaa',
    ])
  })

  it('no modifica la lista que recibe', () => {
    const entrada = ['hero-tasacion-neta', 'hero-tasacion']
    ordenarClavesDeVideo(entrada)
    expect(entrada).toEqual(['hero-tasacion-neta', 'hero-tasacion'])
  })
})
