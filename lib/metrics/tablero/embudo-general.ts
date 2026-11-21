/**
 * Embudo general de la campaña de tasación, de la impresión a la captación, con
 * el % de cada paso sobre el anterior. Módulo puro.
 *
 * Los tres primeros pasos salen de Meta (impresiones, clics en el enlace y
 * visitas a la página que cuenta Meta) y el resto de la plataforma (personas
 * únicas, `personas.ts`). El paso "solicitudes" se divide por las visitas de
 * Meta a propósito: es la única medida de visitas que existe en todos los meses
 * (las visitas propias se miden desde el 20/07/2026).
 */

import type { Paso } from '../panel/embudo'

export interface PasoGeneral {
  clave: 'impresiones' | 'clics' | 'visitas' | 'solicitudes' | 'agendadas' | 'realizadas' | 'captadas'
  etapa: string
  /** null = sin dato (nunca 0 inventado). */
  cantidad: number | null
  /** Sobre el paso anterior. null en el primero, sin dato o con el anterior en 0. */
  pct: number | null
  fuente: 'meta' | 'plataforma'
}

const div = (a: number | null, b: number | null) => (a == null || !b ? null : a / b)

export function embudoGeneral(meta: { impresiones: number; clics: number; visitasMeta: number } | null, pasos: Paso[]): PasoGeneral[] {
  const de = (etapa: Paso['etapa']) => pasos.find(p => p.etapa === etapa)?.cantidad ?? null
  const imp = meta?.impresiones ?? null, cli = meta?.clics ?? null, vis = meta?.visitasMeta ?? null
  const sol = de('solicitud'), age = de('agendada'), rea = de('realizada'), cap = de('captada')
  return [
    { clave: 'impresiones', etapa: 'Impresiones', cantidad: imp, pct: null, fuente: 'meta' },
    { clave: 'clics', etapa: 'Clics en el anuncio', cantidad: cli, pct: div(cli, imp), fuente: 'meta' },
    { clave: 'visitas', etapa: 'Visitas a la página', cantidad: vis, pct: div(vis, cli), fuente: 'meta' },
    { clave: 'solicitudes', etapa: 'Solicitudes de tasación', cantidad: sol, pct: div(sol, vis), fuente: 'plataforma' },
    { clave: 'agendadas', etapa: 'Agendadas', cantidad: age, pct: div(age, sol), fuente: 'plataforma' },
    { clave: 'realizadas', etapa: 'Tasaciones hechas', cantidad: rea, pct: div(rea, age), fuente: 'plataforma' },
    { clave: 'captadas', etapa: 'Captadas', cantidad: cap, pct: div(cap, rea), fuente: 'plataforma' },
  ]
}
