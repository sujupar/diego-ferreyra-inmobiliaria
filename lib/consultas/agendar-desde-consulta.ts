/**
 * Reglas de "Agendar visita" desde una consulta (sección Consultas): en qué
 * paso arranca, qué se le pide al equipo y cómo se ordena la búsqueda de
 * propiedades. La pantalla (`components/consultas/AgendarDesdeConsulta.tsx`)
 * solo compone; acá vive lo que se puede probar sin montarla.
 *
 * El orden de los pasos es fijo: primero la propiedad (sin ella `POST
 * /api/visits` rechaza la consulta), después el teléfono (la ventana rápida no
 * corrige teléfonos y bloquea el envío si no sirve), y recién ahí el día y la hora.
 * Módulo puro y seguro para el navegador.
 */
import type { ConsultaEnBandeja } from './tipos'
import { armarDesdePartes, leerTelefono, type TelefonoLeido } from './telefono'
import { formatearDiaYNumero } from '@/lib/visitas/horario'

export type PasoDesdeConsulta = 'elegir_propiedad' | 'telefono' | 'agendar'

export type TelefonoAceptado = Extract<TelefonoLeido, { ok: true }>

/** Lo que sigue cuando la consulta ya tiene su propiedad. */
export function pasoTrasPropiedad(c: ConsultaEnBandeja): PasoDesdeConsulta {
  return c.tel.ok ? 'agendar' : 'telefono'
}

export function pasoInicial(c: ConsultaEnBandeja): PasoDesdeConsulta {
  return c.property_id ? pasoTrasPropiedad(c) : 'elegir_propiedad'
}

/** Sin teléfono se PIDE (no hay nada que corregir); con uno mal escrito se REVISA. */
export function modoTelefono(c: ConsultaEnBandeja): 'pedir' | 'revisar' {
  return !c.tel.ok && c.tel.motivo === 'vacio' ? 'pedir' : 'revisar'
}

/** MercadoLibre oculta el contacto de quien pregunta: el único camino es el chat del portal. */
export function textoSinTelefono(portal: string): string {
  return portal === 'mercadolibre'
    ? 'MercadoLibre no comparte el contacto. Pedile el celular por el chat del portal.'
    : 'No dejó teléfono.'
}

/** Minúsculas y sin tildes, venga la tilde compuesta o descompuesta (NFD de macOS). */
function plano(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Las propiedades cuyo barrio aparece en lo que sabemos del aviso (dirección o
 * título) van primero: casi siempre la propiedad buscada es una de esas. Es un
 * ORDEN, no un filtro: si el aviso nombra mal el barrio, la buena sigue en la lista.
 */
export function ordenarCercanasPrimero<T extends { neighborhood: string | null }>(
  propiedades: readonly T[],
  textosDelAviso: ReadonlyArray<string | null>,
): { cercanas: T[]; resto: T[]; barrios: string[] } {
  const aviso = plano(textosDelAviso.filter((t): t is string => !!t).join(' '))
  const cercanas: T[] = []
  const resto: T[] = []
  const barrios = new Map<string, string>()
  for (const p of propiedades) {
    const barrio = p.neighborhood ? plano(p.neighborhood) : ''
    // Menos de 3 letras coincidiría con cualquier texto.
    if (aviso && barrio.length >= 3 && aviso.includes(barrio)) {
      cercanas.push(p)
      if (!barrios.has(barrio)) barrios.set(barrio, (p.neighborhood ?? '').trim())
    } else {
      resto.push(p)
    }
  }
  return { cercanas, resto, barrios: [...barrios.values()] }
}

/**
 * Lo que tipeó el equipo. Un número de otro país se acepta SOLO escrito con `+`
 * y su código: es la misma regla de `leerTelefono` (sin `+`, todo es argentino),
 * acá exigida también en el campo libre para que nadie la saltee por error.
 */
export function leerTelefonoIngresado(e: {
  extranjero: boolean
  caracteristica: string
  numero: string
  libre: string
}): TelefonoLeido {
  if (!e.extranjero) return armarDesdePartes(e.caracteristica, e.numero)
  const libre = e.libre.trim()
  if (!libre) return { ok: false, motivo: 'vacio', crudo: e.libre }
  if (!libre.startsWith('+')) return { ok: false, motivo: 'no_es_celular', crudo: e.libre }
  return leerTelefono(libre)
}

export type ResultadoConexion = { ok: true; actualizadas: number; recordado: boolean } | { ok: false; error: string }

/**
 * Respuesta de `POST /api/consultas/[id]/propiedad` (sin envolver en `{ data }`).
 * Tolerante: un 504 del gateway de Netlify es HTML y `res.json()` explotaría.
 */
export async function leerConexion(res: Response): Promise<ResultadoConexion> {
  let cuerpo: unknown = null
  try { cuerpo = await res.json() } catch { /* HTML de error del gateway */ }
  const objeto = cuerpo && typeof cuerpo === 'object' ? cuerpo : null
  if (res.ok && objeto && 'actualizadas' in objeto && typeof objeto.actualizadas === 'number'
    && 'recordado' in objeto && typeof objeto.recordado === 'boolean') {
    return { ok: true, actualizadas: objeto.actualizadas, recordado: objeto.recordado }
  }
  if (objeto && 'error' in objeto && typeof objeto.error === 'string') return { ok: false, error: objeto.error }
  if (res.status === 504) return { ok: false, error: 'El servidor tardó demasiado. Probá de nuevo.' }
  if (res.ok) return { ok: false, error: 'Respuesta inesperada del servidor. Probá de nuevo.' }
  return { ok: false, error: 'Algo falló. Probá de nuevo.' }
}

/** "jueves 30 · 17:00" (horario de Argentina, como se agendó). */
export function tituloListo(fecha: string, hora: string): string {
  const dia = formatearDiaYNumero(fecha)
  return dia ? `${dia} · ${hora}` : hora
}
