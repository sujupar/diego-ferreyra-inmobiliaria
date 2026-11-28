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

export function detectarBloqueo(r: { url: string; status: number; cuerpo: string }): TipoBloqueo | null {
  if (r.url.includes('/accounts/login') || /"require_login"\s*:\s*true/.test(r.cuerpo)) return 'login'
  if (r.url.includes('/challenge') || r.url.includes('/checkpoint') || /checkpoint_required|"challenge"/.test(r.cuerpo)) {
    return 'desafio'
  }
  if (r.status === 429 || /Please wait a few minutes|feedback_required/.test(r.cuerpo)) return 'limite'
  return null
}
