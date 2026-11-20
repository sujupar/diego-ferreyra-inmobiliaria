/**
 * Fechas del panel. Todo en 'YYYY-MM-DD' (fecha de Argentina), comparado como
 * texto: así no hay husos horarios en el medio.
 */

export type Agrupar = 'dia' | 'semana' | 'mes'
/**
 * Contra qué se compara:
 *  - 'anterior': los N días inmediatamente anteriores.
 *  - 'mes_anterior': el MISMO TRAMO del mes anterior (1–20/11 → 1–20/10). Es lo
 *    que usa el Tablero: comparar 20 días de noviembre contra 31 de octubre no
 *    dice nada.
 *  - 'anio_pasado': las mismas fechas del año anterior.
 */
export type Comparar = 'anterior' | 'mes_anterior' | 'anio_pasado' | 'ninguno'
export interface Rango { desde: string; hasta: string }

const DIA_MS = 86_400_000
const aFecha = (s: string) => new Date(s + 'T00:00:00Z')
const aTexto = (d: Date) => d.toISOString().slice(0, 10)

export function sumarDias(s: string, n: number): string {
  return aTexto(new Date(aFecha(s).getTime() + n * DIA_MS))
}

export function diasEntre(r: Rango): number {
  return Math.round((aFecha(r.hasta).getTime() - aFecha(r.desde).getTime()) / DIA_MS) + 1
}

export const enRango = (f: string | null | undefined, r: Rango) => !!f && f >= r.desde && f <= r.hasta

/** Lunes de la semana de esa fecha. */
export function lunes(s: string): string {
  const d = aFecha(s)
  const dow = (d.getUTCDay() + 6) % 7
  return sumarDias(s, -dow)
}

export function clave(s: string, a: Agrupar): string {
  if (a === 'mes') return s.slice(0, 7)
  if (a === 'semana') return lunes(s)
  return s
}

/** Las claves de todos los grupos del rango, en orden (incluye los vacíos). */
export function claves(r: Rango, a: Agrupar): string[] {
  const out: string[] = []
  for (let f = r.desde; f <= r.hasta; f = sumarDias(f, 1)) {
    const k = clave(f, a)
    if (out[out.length - 1] !== k) out.push(k)
  }
  return out
}

/** Último día del mes de 'YYYY-MM'. */
const finDeMes = (ym: string) => `${ym}-${String(new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`

/** La misma fecha un mes antes; si ese día no existe (31/3 → feb), el último del mes. */
export function mesAntes(s: string): string {
  const y = Number(s.slice(0, 4)), m = Number(s.slice(5, 7))
  const ym = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
  const fin = finDeMes(ym)
  return s.slice(8) > fin.slice(8) ? fin : `${ym}-${s.slice(8)}`
}

/** Período contra el que se compara. */
export function rangoComparado(r: Rango, c: Comparar): Rango | null {
  if (c === 'ninguno') return null
  if (c === 'mes_anterior') {
    const desde = mesAntes(r.desde)
    // Si el período termina el último día de su mes, el tramo comparado también (30/11 → 31/10).
    const hasta = sumarDias(r.hasta, 1).slice(8) === '01' ? sumarDias(`${r.hasta.slice(0, 8)}01`, -1) : mesAntes(r.hasta)
    return { desde, hasta: hasta < desde ? desde : hasta }
  }
  if (c === 'anio_pasado') {
    const menosUno = (s: string) => `${Number(s.slice(0, 4)) - 1}${s.slice(4)}`
    // 29 de febrero → 28.
    const fix = (s: string) => (s.endsWith('-02-29') ? s.replace('-02-29', '-02-28') : s)
    return { desde: fix(menosUno(r.desde)), hasta: fix(menosUno(r.hasta)) }
  }
  const n = diasEntre(r)
  return { desde: sumarDias(r.desde, -n), hasta: sumarDias(r.desde, -1) }
}

export type Atajo = 'esta_semana' | 'semana_pasada' | 'este_mes' | 'mes_pasado' | 'trimestre' | 'anio' | 'ultimos_30'

export function rangoDeAtajo(a: Atajo, hoy: string): Rango {
  const mes0 = hoy.slice(0, 8) + '01'
  switch (a) {
    case 'esta_semana': return { desde: lunes(hoy), hasta: hoy }
    case 'semana_pasada': { const l = sumarDias(lunes(hoy), -7); return { desde: l, hasta: sumarDias(l, 6) } }
    case 'este_mes': return { desde: mes0, hasta: hoy }
    case 'mes_pasado': {
      const fin = sumarDias(mes0, -1)
      return { desde: fin.slice(0, 8) + '01', hasta: fin }
    }
    case 'trimestre': {
      const m = Number(hoy.slice(5, 7)), q = Math.floor((m - 1) / 3) * 3 + 1
      return { desde: `${hoy.slice(0, 4)}-${String(q).padStart(2, '0')}-01`, hasta: hoy }
    }
    case 'anio': return { desde: hoy.slice(0, 4) + '-01-01', hasta: hoy }
    case 'ultimos_30': return { desde: sumarDias(hoy, -29), hasta: hoy }
  }
}

/** Fecha de hoy en Argentina. */
export function hoyArgentina(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(now)
}
