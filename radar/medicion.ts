import type { ConfigRadar, MedicionCuenta, ReelCrudo } from './tipos'

const MS_DIA = 86_400_000
/** Con menos reels maduros que esto la mediana no dice nada. */
const MIN_BASE = 6

export function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Mide los reels de UNA cuenta contra su propia mediana de vistas.
 * - La base son los `reelsBase` reels MADUROS más recientes (los jóvenes todavía
 *   están sumando vistas y bajarían la mediana).
 * - Un reel inmaduro sí puede ser candidato: justamente un viral reciente.
 * - Los reels sin vistas o que no son reel no existen para esta cuenta.
 * `ahora` se inyecta para que sea determinista.
 */
export function medirCuenta(reels: ReelCrudo[], cfg: ConfigRadar, ahora: Date): MedicionCuenta {
  const edadDias = (r: ReelCrudo) => (ahora.getTime() - new Date(r.publicadoAt).getTime()) / MS_DIA
  const validos = reels.filter((r) => r.esReel && r.vistas != null && r.vistas > 0)

  const maduros = validos
    .filter((r) => edadDias(r) >= cfg.diasMaduro)
    .sort((a, b) => new Date(b.publicadoAt).getTime() - new Date(a.publicadoAt).getTime())
  if (maduros.length < MIN_BASE) {
    return {
      base: null,
      baseN: 0,
      candidatos: [],
      descartados: validos.map((r) => ({ shortcode: r.shortcode, motivo: 'base insuficiente', multiplicador: null })),
    }
  }

  const usados = maduros.slice(0, cfg.reelsBase)
  const base = mediana(usados.map((r) => r.vistas as number)) as number

  const candidatos: MedicionCuenta['candidatos'] = []
  const descartados: MedicionCuenta['descartados'] = []
  for (const r of validos) {
    const vistas = r.vistas as number
    const multiplicador = vistas / base
    let motivo: string | null = null
    if (edadDias(r) > cfg.diasMax) motivo = 'viejo'
    else if (vistas < cfg.vistasMin) motivo = 'pocas vistas'
    else if (multiplicador < cfg.multiplicadorMin) motivo = 'bajo multiplicador'
    if (motivo) descartados.push({ shortcode: r.shortcode, motivo, multiplicador })
    else candidatos.push({ ...r, multiplicador })
  }
  return { base, baseN: usados.length, candidatos, descartados }
}
