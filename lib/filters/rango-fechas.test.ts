import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  inicioDelDiaArgentina,
  finDelDiaArgentina,
  esFechaDeCalendario,
  DESFASE_ARGENTINA,
} from './rango-fechas'

/** ¿El instante `iso` cae dentro del rango que el servidor arma para `dia`? */
function caeEnElDia(iso: string, dia: string): boolean {
  const t = new Date(iso).getTime()
  return (
    t >= new Date(inicioDelDiaArgentina(dia)).getTime() &&
    t <= new Date(finDelDiaArgentina(dia)).getTime()
  )
}

afterEach(() => {
  vi.useRealTimers()
})

describe('rango-fechas — un día del filtro es un día argentino', () => {
  it('el desfase del negocio es UTC−3 fijo', () => {
    expect(DESFASE_ARGENTINA).toBe('-03:00')
  })

  it('abre el día a las 00:00 de Argentina, no a las 00:00 UTC', () => {
    expect(inicioDelDiaArgentina('2026-08-05')).toBe('2026-08-05T00:00:00.000-03:00')
    // Que es lo mismo que decir las 03:00 UTC, tres horas DESPUÉS de lo que
    // hacía el código viejo (`2026-08-05T00:00:00Z` = las 21:00 del día 4 acá).
    expect(new Date(inicioDelDiaArgentina('2026-08-05')).toISOString())
      .toBe('2026-08-05T03:00:00.000Z')
  })

  it('cierra el día al final de las 23:59 de Argentina, no a las 23:59 UTC', () => {
    expect(finDelDiaArgentina('2026-08-05')).toBe('2026-08-05T23:59:59.999999-03:00')
    // 02:59:59.999999 del día siguiente en UTC. El código viejo cortaba en
    // `2026-08-05T23:59:59Z` = las 20:59 de acá: perdía las últimas 3 horas.
    expect(new Date(finDelDiaArgentina('2026-08-05')).toISOString())
      .toBe('2026-08-06T02:59:59.999Z') // Date trunca a milisegundos; Postgres recibe los 6 dígitos
  })

  it('el rango de un solo día dura exactamente 24 horas', () => {
    const abre = new Date(inicioDelDiaArgentina('2026-08-05')).getTime()
    const cierra = new Date(finDelDiaArgentina('2026-08-05')).getTime()
    // 24h menos el milisegundo que le come el truncado de Date (Postgres
    // recibe .999999 y ahí el borde es exacto).
    expect(cierra - abre).toBe(24 * 60 * 60 * 1000 - 1)
  })
})

describe('rango-fechas — el borde de las 21:00 (el que rompía todo)', () => {
  // 21:00 hora argentina = 00:00 UTC del día siguiente. Ahí es donde el filtro
  // viejo cambiaba de día tres horas antes de tiempo.
  const CASI_MEDIANOCHE_LOCAL = '2026-08-05T00:30:00Z' // = 4 de agosto, 21:30 en Argentina

  it('un registro de las 21:30 del día X aparece al filtrar por X', () => {
    expect(caeEnElDia(CASI_MEDIANOCHE_LOCAL, '2026-08-04')).toBe(true)
  })

  it('...y NO aparece al filtrar por X+1', () => {
    expect(caeEnElDia(CASI_MEDIANOCHE_LOCAL, '2026-08-05')).toBe(false)
  })

  it('las 23:59 locales del día X siguen siendo del día X', () => {
    // 2026-08-06T02:59:00Z = 5 de agosto, 23:59 en Argentina.
    expect(caeEnElDia('2026-08-06T02:59:00Z', '2026-08-05')).toBe(true)
    expect(caeEnElDia('2026-08-06T02:59:00Z', '2026-08-06')).toBe(false)
  })

  it('las 00:01 locales del día X+1 ya son del día X+1', () => {
    // 2026-08-06T03:01:00Z = 6 de agosto, 00:01 en Argentina.
    expect(caeEnElDia('2026-08-06T03:01:00Z', '2026-08-06')).toBe(true)
    expect(caeEnElDia('2026-08-06T03:01:00Z', '2026-08-05')).toBe(false)
  })
})

describe('rango-fechas — con el reloj congelado en un instante que cae en días distintos', () => {
  // 2026-08-08T02:30:00Z = 7 de agosto, 23:30 en Argentina. UTC ya está en el 8.
  const AHORA = '2026-08-08T02:30:00Z'

  it('"hoy" (el 7 local) cubre el día local entero: nada del 6, nada del 8', () => {
    vi.setSystemTime(new Date(AHORA))

    const hoyLocal = '2026-08-07'
    // El instante congelado es "ahora": tiene que estar adentro.
    expect(caeEnElDia(AHORA, hoyLocal)).toBe(true)

    // La primera hora del día local (00:00 del 7 acá = 03:00Z del 7): adentro.
    expect(caeEnElDia('2026-08-07T03:00:00Z', hoyLocal)).toBe(true)
    // Un minuto ANTES de que empiece el 7 local (23:59 del 6 acá): afuera.
    expect(caeEnElDia('2026-08-07T02:59:00Z', hoyLocal)).toBe(false)
    // El último minuto del 7 local (23:59 acá = 02:59Z del 8): adentro.
    expect(caeEnElDia('2026-08-08T02:59:00Z', hoyLocal)).toBe(true)
    // El primer minuto del 8 local (00:01 acá = 03:01Z del 8): afuera.
    expect(caeEnElDia('2026-08-08T03:01:00Z', hoyLocal)).toBe(false)
  })

  it('el día UTC (el 8) NO es el día que ve el usuario: su noche todavía es el 7', () => {
    vi.setSystemTime(new Date(AHORA))
    // Lo que estaba pasando: el sistema mostraba el 8 y el usuario estaba en el 7.
    expect(caeEnElDia(AHORA, '2026-08-08')).toBe(false)
  })
})

describe('rango-fechas — los otros formatos siguen funcionando', () => {
  it('reconoce una fecha de calendario y descarta cualquier otra cosa', () => {
    expect(esFechaDeCalendario('2026-08-05')).toBe(true)
    expect(esFechaDeCalendario('2026-08-05T00:00:00Z')).toBe(false)
    expect(esFechaDeCalendario('2026-08-05T00:00:00.000-03:00')).toBe(false)
    expect(esFechaDeCalendario('')).toBe(false)
    expect(esFechaDeCalendario('ayer')).toBe(false)
  })

  it('un instante ISO completo pasa TAL CUAL — no se le agrega ninguna hora', () => {
    // Es lo que manda el tablero de inicio (`rangoDeHoy()` en
    // app/(dashboard)/inicio/page.tsx) y la pantalla de visitas: ellos ya
    // resolvieron el rango. Convertirlos otra vez los rompería.
    const instante = '2026-08-07T03:00:00.000Z'
    expect(inicioDelDiaArgentina(instante)).toBe(instante)
    expect(finDelDiaArgentina(instante)).toBe(instante)

    const conDesfase = '2026-08-07T23:59:59.999-03:00'
    expect(inicioDelDiaArgentina(conDesfase)).toBe(conDesfase)
    expect(finDelDiaArgentina(conDesfase)).toBe(conDesfase)
  })

  it('un valor con hora pero sin zona también pasa tal cual', () => {
    expect(inicioDelDiaArgentina('2026-08-05T10:00:00')).toBe('2026-08-05T10:00:00')
    expect(finDelDiaArgentina('2026-08-05T10:00:00')).toBe('2026-08-05T10:00:00')
  })

  it('una fecha con forma inválida no se disfraza de instante', () => {
    // Mismo comportamiento que antes: llega a Postgres tal cual y falla ahí.
    // Lo importante es que NO se convierta en algo que parece válido.
    expect(inicioDelDiaArgentina('2026-8-5')).toBe('2026-8-5')
  })
})
