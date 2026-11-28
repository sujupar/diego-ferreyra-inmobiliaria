// Detección de los frenos de Instagram. Ante cualquiera, la corrida se para entera:
// nada de reintentar el mismo día (Global Constraints).

export type TipoBloqueo = 'login' | 'desafio' | 'limite'

export class BloqueoInstagram extends Error {
  constructor(
    public readonly tipo: TipoBloqueo,
    mensaje: string,
  ) {
    super(mensaje)
    this.name = 'BloqueoInstagram'
  }
}

/** Segmentos del path de la URL (sin vacíos). Una URL rota da []. */
function segmentos(url: string): string[] {
  try {
    return new URL(url, 'https://www.instagram.com').pathname.split('/').filter(Boolean)
  } catch {
    return []
  }
}

/** Mensaje de freno de ritmo (en el campo `message` o, si no es JSON, en el texto de un no-200). */
const RE_LIMITE = /Please wait a few minutes|feedback_required/i

/**
 * ¿La respuesta es un freno de Instagram? Reglas, aprendidas con falsos positivos:
 * - La URL se mira por SEGMENTOS del path, nunca con `includes`: el perfil
 *   `/challengeinmobiliario/` no es un desafío.
 * - Del cuerpo solo cuentan los campos de PRIMER nivel del JSON (`message`, `status`,
 *   `require_login`, `checkpoint_url`, `challenge`). Un 200 trae captions y comentarios
 *   escritos por cualquiera: "Please wait a few minutes" en un caption no es un límite.
 * - El texto libre se mira solo si la respuesta NO es 200 y no es JSON (p. ej. HTML de error).
 * - Un 401/403 pelado NO es sesión vencida acá: sin URL o cuerpo que lo confirme, es un error
 *   de esa lectura (lo decide el que llama).
 */
export function detectarBloqueo(r: { url: string; status: number; cuerpo: string }): TipoBloqueo | null {
  const seg = segmentos(r.url)
  if (seg[0] === 'accounts' && seg[1] === 'login') return 'login'
  if (seg[0] === 'challenge' || seg[0] === 'checkpoint') return 'desafio'

  let json: Record<string, unknown> | null = null
  try {
    const v: unknown = JSON.parse(r.cuerpo)
    if (v && typeof v === 'object' && !Array.isArray(v)) json = v as Record<string, unknown>
  } catch {
    json = null
  }

  if (json) {
    const mensaje = typeof json.message === 'string' ? json.message : ''
    if (json.require_login === true || mensaje === 'login_required') return 'login'
    if (
      mensaje === 'checkpoint_required' ||
      mensaje === 'challenge_required' ||
      (typeof json.checkpoint_url === 'string' && json.checkpoint_url !== '') ||
      (json.challenge != null && typeof json.challenge === 'object')
    ) {
      return 'desafio'
    }
    if (r.status === 429) return 'limite'
    if (RE_LIMITE.test(mensaje) || json.feedback_required === true || json.spam === true) return 'limite'
    return null
  }

  if (r.status === 429) return 'limite'
  if (r.status !== 200 && r.cuerpo) {
    if (/"require_login"\s*:\s*true/.test(r.cuerpo)) return 'login'
    if (/checkpoint_required|challenge_required/.test(r.cuerpo)) return 'desafio'
    if (RE_LIMITE.test(r.cuerpo)) return 'limite'
  }
  return null
}
