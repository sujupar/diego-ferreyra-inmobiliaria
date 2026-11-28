// URLs firmadas ESTABLES en el cliente.
//
// Cada GET /api/video-refs firma de nuevo video y portada, y cada firma es una URL distinta.
// Mientras una referencia se guioniza, la grilla refresca cada 8 s: con URLs nuevas el
// <video> se reiniciaba y las portadas se volvían a bajar. Acá se guarda la PRIMERA URL de
// cada archivo de Storage y se la reusa hasta que se acerque su vencimiento (la firma dura
// 1 h; se renueva a los 50 min).

export const VIDA_URL_MS = 50 * 60_000

export type CacheUrls = Map<string, { url: string; desde: number }>

type ConUrls = {
  video_storage_path: string | null
  portada_storage_path: string | null
  video_url: string | null
  portada_url: string | null
}

function estable(cache: CacheUrls, path: string | null, nueva: string | null, ahora: number): string | null {
  if (!path || !nueva) return nueva
  const guardada = cache.get(path)
  if (guardada && ahora - guardada.desde < VIDA_URL_MS) return guardada.url
  cache.set(path, { url: nueva, desde: ahora })
  return nueva
}

/** Devuelve las refs con la URL ya conocida de cada archivo (o la nueva si no había o venció). */
export function estabilizarUrls<T extends ConUrls>(refs: T[], cache: CacheUrls, ahora: number = Date.now()): T[] {
  return refs.map((r) => ({
    ...r,
    video_url: estable(cache, r.video_storage_path, r.video_url, ahora),
    // Sin portada propia la URL es el thumbnail público, que no cambia: se deja como viene.
    portada_url: r.portada_storage_path ? estable(cache, r.portada_storage_path, r.portada_url, ahora) : r.portada_url,
  }))
}
