/**
 * Fichas fusionadas: la copia vieja de una propiedad duplicada queda
 * `status='descartada'` con la dirección `[FUSIONADA-><8 primeros del id vigente>] …`
 * (fusión del 2026-07-13, ver CLAUDE.md § properties.status).
 *
 * La fusión movió proceso, contacto y tasación, pero NO las consultas de los
 * portales ni las filas de `portal_property_map`. Resultado (medido el
 * 2026-10-10): dos avisos de Zonaprop de Entre Ríos 2333 seguían apuntando a la
 * copia y 39 consultas —la última del 2026-10-06— colgaban de una ficha
 * descartada que nadie mira. Este módulo decide, sin tocar la base, a qué ficha
 * vigente pertenece cada copia. Ante la duda NO adivina: devuelve el motivo.
 */

export interface FichaR {
  id: string
  address: string | null
  status: string | null
}

export type Resolucion =
  | { ok: true; vigente: FichaR }
  | { ok: false; motivo: string }

const MARCA = /^\[FUSIONADA->([0-9a-f]{8})\]/i

/** El prefijo del id vigente escrito en la marca, o null si no hay marca válida. */
export function prefijoDeFusion(address: string | null | undefined): string | null {
  const m = MARCA.exec(address ?? '')
  return m ? m[1].toLowerCase() : null
}

/** La única ficha no descartada cuyo id empieza con el prefijo de la marca. */
export function resolverFichaVigente(copia: FichaR, fichas: readonly FichaR[]): Resolucion {
  const prefijo = prefijoDeFusion(copia.address)
  if (!prefijo) return { ok: false, motivo: 'no es una copia fusionada' }
  const candidatas = fichas.filter(f =>
    f.id !== copia.id && f.status !== 'descartada' && f.id.toLowerCase().startsWith(prefijo))
  if (candidatas.length === 0) return { ok: false, motivo: `no hay ficha vigente con el prefijo ${prefijo}` }
  if (candidatas.length > 1) return { ok: false, motivo: `hay ${candidatas.length} fichas vigentes con el prefijo ${prefijo}` }
  return { ok: true, vigente: candidatas[0] }
}
