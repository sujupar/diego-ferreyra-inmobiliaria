/**
 * El catálogo de tipos de trabajo vive en DOS lugares: esta lista de TypeScript
 * y un CHECK de Postgres. Si se separan, no falla el trabajo nuevo: falla el
 * INSERT ENTERO —los cinco avisos se encolan en una sola sentencia— y el lead
 * se queda sin email al equipo, sin tarea y sin evento de conversión a Meta.
 *
 * Pasó de verdad el 2026-08-13: se agregó 'whatsapp' al código y no al CHECK.
 * La cola quedó vacía y el síntoma visible fue "no me llegó el WhatsApp", que
 * apuntaba al lugar equivocado.
 *
 * Este test lee las migraciones y compara. No necesita base: es texto contra
 * texto, y corre en cada suite.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { TIPOS_DE_TRABAJO } from './jobs-logic'

const DIR = join(process.cwd(), 'supabase', 'migrations')

/** Los valores del último CHECK sobre `kind` de funnel_lead_jobs en las migraciones. */
function tiposQueAceptaLaBase(): string[] {
  // En orden cronológico: la última definición es la que manda.
  const archivos = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
  let ultima: string[] | null = null

  for (const f of archivos) {
    const sql = readFileSync(join(DIR, f), 'utf8')
    if (!sql.includes('funnel_lead_jobs')) continue
    // Matchea tanto la definición inline de la columna como un ADD CONSTRAINT.
    const re = /kind\s+(?:TEXT\s+NOT\s+NULL\s+)?CHECK\s*\(\s*kind\s+IN\s*\(([^)]*)\)/gi
    const re2 = /CHECK\s*\(\s*kind\s+IN\s*\(([^)]*)\)/gi
    for (const rx of [re, re2]) {
      let m: RegExpExecArray | null
      while ((m = rx.exec(sql)) !== null) {
        ultima = m[1]
          .split(',')
          .map((s) => s.trim().replace(/^'|'$/g, ''))
          .filter(Boolean)
      }
    }
  }
  return ultima ?? []
}

describe('el catálogo de trabajos del embudo no puede separarse de la base', () => {
  it('encuentra el CHECK en las migraciones', () => {
    expect(tiposQueAceptaLaBase().length).toBeGreaterThan(0)
  })

  it('la base acepta TODOS los tipos que el código puede encolar', () => {
    const enLaBase = tiposQueAceptaLaBase()
    const faltantes = TIPOS_DE_TRABAJO.filter((t) => !enLaBase.includes(t))
    expect(
      faltantes,
      `Estos tipos existen en el código pero el CHECK de Postgres los rechaza: ${faltantes.join(', ')}. ` +
        'Un solo tipo rechazado tumba el INSERT de los cinco avisos. ' +
        'Agregalos al CHECK con una migración ANTES de deployar.',
    ).toEqual([])
  })

  it('no hay tipos en la base que el código ya no conozca (catálogo muerto)', () => {
    const enLaBase = tiposQueAceptaLaBase()
    const sobrantes = enLaBase.filter((t) => !TIPOS_DE_TRABAJO.includes(t as never))
    expect(sobrantes).toEqual([])
  })
})
