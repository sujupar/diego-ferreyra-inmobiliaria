/**
 * El archivo del video se borra de Storage 30 días después de que TODAS sus
 * redes terminaron (publicado o cancelado). La miniatura, la transcripción y los
 * enlaces quedan para siempre. Con 30 videos por semana, sin esto se juntan
 * ~10 GB por mes de archivos que nadie vuelve a usar.
 *
 * Un envío fallido NO cuenta como terminado: todavía se lo puede reintentar, y
 * para eso hace falta el archivo.
 */
import type { EnvioFila } from '../tipos'

export const DIAS_ANTES_DE_BORRAR = 30

export function listoParaBorrar(envios: Pick<EnvioFila, 'estado' | 'updated_at'>[], ahora: Date): boolean {
  if (envios.length === 0) return false
  if (!envios.every((e) => e.estado === 'publicado' || e.estado === 'cancelado')) return false
  const ultimo = Math.max(...envios.map((e) => Date.parse(e.updated_at)))
  return ahora.getTime() - ultimo > DIAS_ANTES_DE_BORRAR * 86_400_000
}
