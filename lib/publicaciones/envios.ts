/**
 * Qué hacer con los envíos de un video cuando cambian sus íconos de redes.
 *
 * Solo se tocan los envíos que todavía no arrancaron: uno `en_curso`, `publicado`
 * o `fallido` ya tiene historia en la red y apagar el ícono no lo puede deshacer.
 */
import type { EnvioFila, Plataforma } from './tipos'

export function sincronizarEnvios(
  redes: readonly Plataforma[],
  actuales: Pick<EnvioFila, 'plataforma' | 'estado'>[],
): { crear: Plataforma[]; cancelar: Plataforma[]; reactivar: Plataforma[] } {
  const porRed = new Map(actuales.map((e) => [e.plataforma, e.estado]))
  const encendidas = new Set(redes)
  const crear: Plataforma[] = []
  const cancelar: Plataforma[] = []
  const reactivar: Plataforma[] = []

  for (const red of encendidas) {
    const estado = porRed.get(red)
    if (estado === undefined) crear.push(red)
    else if (estado === 'cancelado') reactivar.push(red)
  }
  for (const [red, estado] of porRed) {
    if (!encendidas.has(red) && estado === 'programado') cancelar.push(red)
  }
  return { crear, cancelar, reactivar }
}
