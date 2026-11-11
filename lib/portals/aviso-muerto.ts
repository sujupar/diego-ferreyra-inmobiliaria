// ¿El aviso que quedó registrado ya no existe en el portal? Puro, sin red.
// Sobre un aviso muerto el banner nunca debe ofrecer sincronizar.
import { PortalAdapterError } from './types'

export const avisoMlCerrado = (status: string | undefined): boolean => status === 'closed'

export const avisoApEliminado = (estado: string | undefined): boolean =>
  (estado ?? '').trim().toUpperCase() === 'ELIMINADO'

/** La lectura del aviso respondió 404 / ENT001 (Argenprop: entidad inexistente). */
export function errorDeAvisoInexistente(err: unknown): boolean {
  const original = err instanceof PortalAdapterError ? String(err.original ?? '') : ''
  const txt = `${err instanceof Error ? err.message : ''} ${original}`
  return /\b404\b|ENT001/i.test(txt)
}

export const mensajeAvisoInexistente = (portal: string): string =>
  `El aviso ya no existe en ${portal}; volvé a publicarlo desde su asistente.`
