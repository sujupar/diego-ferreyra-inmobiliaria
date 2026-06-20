/**
 * Identidad anónima del visitante (sin PII) para medir analítica de video
 * aunque la persona no se haya registrado. UUID v4 propio en cookie first-party
 * `df_anon` (2 años) + fallback localStorage, reconciliados. Bajo nuestro control
 * (no depende de `_fbp`, que vive ~90d y solo si cargó el Pixel).
 */

const KEY = 'df_anon'
const TWO_YEARS = 60 * 60 * 24 * 365 * 2

function readCookie(): string {
  if (typeof document === 'undefined') return ''
  const m = document.cookie.match(/(?:^|;\s*)df_anon=([^;]*)/)
  return m ? decodeURIComponent(m[1]) : ''
}

function writeCookie(id: string): void {
  if (typeof document === 'undefined') return
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${KEY}=${encodeURIComponent(id)}; Max-Age=${TWO_YEARS}; Path=/; SameSite=Lax${secure}`
}

/** Lee el anon_id existente (cookie → localStorage) sin crear uno nuevo. '' si no hay. */
export function readAnonId(): string {
  let id = readCookie()
  if (!id) {
    try {
      id = localStorage.getItem(KEY) || ''
    } catch {
      /* localStorage bloqueado */
    }
  }
  return id
}

/** Lee o crea el anon_id, persistiéndolo en cookie + localStorage. */
export function getOrCreateAnonId(): string {
  if (typeof window === 'undefined') return ''
  let id = readAnonId()
  if (!id) {
    id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `a-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
  writeCookie(id)
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* localStorage bloqueado */
  }
  return id
}
