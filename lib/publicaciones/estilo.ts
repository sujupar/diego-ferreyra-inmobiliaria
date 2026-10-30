/**
 * Aprender el estilo de las descripciones de Diego desde su Instagram.
 *
 *   sin_aprender → clasificando (lotes de 50, una llamada de IA por lote)
 *                → redactando (una llamada que escribe la guía) → listo
 *
 * Mientras se vuelve a aprender, el documento anterior sigue vigente: se guarda
 * en `anterior` hasta que el nuevo llega a `listo`.
 */

export interface Ejemplo {
  caption: string
  fecha: string
}

export type EstadoEstiloListo = { etapa: 'listo'; guia: string; ejemplos: Ejemplo[]; aprendido_en: string }

export type EstadoEstilo = (
  | { etapa: 'sin_aprender' }
  | { etapa: 'clasificando'; candidatos: { id: string; caption: string; fecha: string }[]; cursor: number; elegidos: string[] }
  | { etapa: 'redactando'; ejemplos: Ejemplo[] }
  | EstadoEstiloListo
) & { anterior?: EstadoEstiloListo | null }

/** El documento que se usa HOY para describir (el nuevo o, mientras se reaprende, el anterior). */
export function estiloVigente(e: EstadoEstilo | null | undefined): EstadoEstiloListo | null {
  if (!e) return null
  if (e.etapa === 'listo') return e
  return e.anterior?.etapa === 'listo' ? e.anterior : null
}
