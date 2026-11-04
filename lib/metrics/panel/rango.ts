/**
 * Fechas del panel. Todo en 'YYYY-MM-DD' (fecha de Argentina), comparado como
 * texto: así no hay husos horarios en el medio.
 */

export type Agrupar = 'dia' | 'semana' | 'mes'
export type Comparar = 'anterior' | 'anio_pasado' | 'ninguno'
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

/** Período contra el que se compara. */
export function rangoComparado(r: Rango, c: Comparar): Rango | null {
  if (c === 'ninguno') return null
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
