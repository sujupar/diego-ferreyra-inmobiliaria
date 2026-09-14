/**
 * El título que un portal va a publicar si la propiedad no tiene uno propio.
 *
 * Es UNA sola regla para los mappers (lo que se publica) y para el paso
 * Descripción de los wizards (lo que se muestra): el 2026-09-14 el título
 * llegaba vacío a la pantalla mientras el aviso salía con "Departamento 2 amb
 * Monserrat" armado acá adentro — lo que se veía no era lo que se publicaba.
 */
export interface PropiedadParaTitulo {
  title?: string | null
  property_type?: string | null
  rooms?: number | null
  neighborhood?: string | null
}

export interface OpcionesTitulo {
  /** Largo máximo del portal (ML 60, Argenprop 80). */
  max: number
  /** true → "Casa 4 amb en Devoto" (estilo Argenprop); false → "Casa 4 amb Devoto" (ML). */
  conjuncion?: boolean
  /** Tipo cuando la propiedad no tiene (ML asume departamento; Argenprop "Propiedad"). */
  tipoPorDefecto?: string
}

export function tituloSugerido(p: PropiedadParaTitulo, opts: OpcionesTitulo): string {
  const propio = (p.title ?? '').trim()
  if (propio) return propio.slice(0, opts.max)
  const tipo = (p.property_type ?? '').trim() || opts.tipoPorDefecto || 'departamento'
  const tipoCap = tipo.charAt(0).toUpperCase() + tipo.slice(1)
  const amb = p.rooms ? `${p.rooms} amb` : ''
  const barrio = (p.neighborhood ?? '').trim()
  const partes = opts.conjuncion && barrio ? [tipoCap, amb, 'en', barrio] : [tipoCap, amb, barrio]
  return partes.filter(Boolean).join(' ').slice(0, opts.max)
}

/** Máximos de cada portal, para que hooks y mappers no los repitan a mano. */
export const TITULO_MAX_ML = 60
export const TITULO_MAX_AP = 80
