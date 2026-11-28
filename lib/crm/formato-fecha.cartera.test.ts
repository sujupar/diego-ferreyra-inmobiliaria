// Lo que la cartera le suma a formato-fecha.ts y horario-laboral.ts (crm-cartera-por-rol,
// design.md D5). Los tests de la ficha siguen en formato-fecha.test.ts y
// horario-laboral.test.ts sin cambios.
import { describe, it, expect } from 'vitest'
import { duracion, haceCuanto, textoVencimiento } from './formato-fecha'
import { HORARIO_LABORAL, minutosHabilesEntre } from './horario-laboral'
import { vencimientoDeTarea } from './tareas-ficha'

// 2026-11-25 (miércoles) 13:40 UTC = 10:40 de Argentina.
const ahora = new Date('2026-11-25T13:40:00Z')
const hace = (min: number) => new Date(ahora.getTime() - min * 60_000).toISOString()

describe('haceCuanto', () => {
  it('20 segundos → "recién" (redondea como la ficha)', () => {
    expect(haceCuanto(hace(1 / 3), ahora)).toBe('recién')
  })
  it('12 minutos → "hace 12 min"', () => {
    expect(haceCuanto(hace(12), ahora)).toBe('hace 12 min')
  })
  it('2 horas del mismo día → "hace 2 h"', () => {
    expect(haceCuanto(hace(125), ahora)).toBe('hace 2 h')
  })
  it('ayer → "ayer"', () => {
    expect(haceCuanto('2026-11-24T13:00:00Z', ahora)).toBe('ayer')
  })
  it('3 días → "hace 3 días"', () => {
    expect(haceCuanto('2026-11-22T13:00:00Z', ahora)).toBe('hace 3 días')
  })
  it('7 días → "hace 7 días" (no la fecha, como la ficha)', () => {
    expect(haceCuanto('2026-11-18T13:00:00Z', ahora)).toBe('hace 7 días')
  })
  it('22 días → "hace 22 días"', () => {
    expect(haceCuanto('2026-11-03T13:00:00Z', ahora)).toBe('hace 22 días')
  })
  it('150 días → "hace 150 días"', () => {
    expect(haceCuanto('2026-06-28T13:00:00Z', ahora)).toBe('hace 150 días')
  })
  it('la medianoche de Argentina: 23:30 visto a las 00:30 es "ayer"', () => {
    // 23:30 AR del 25 = 02:30 UTC del 26; 00:30 AR del 26 = 03:30 UTC del 26.
    expect(haceCuanto('2026-11-26T02:30:00Z', new Date('2026-11-26T03:30:00Z'))).toBe('ayer')
  })
  it('las 22:00 de Argentina (ya mañana en UTC) visto a las 23:00 del mismo día → "hace 1 h"', () => {
    expect(haceCuanto('2026-11-26T01:00:00Z', new Date('2026-11-26T02:00:00Z'))).toBe('hace 1 h')
  })
  it('una fecha futura (relojes desfasados) → "recién"', () => {
    expect(haceCuanto('2026-11-25T14:40:00Z', ahora)).toBe('recién')
  })
  it('una fecha ilegible → vacío', () => {
    expect(haceCuanto('no-es-fecha', ahora)).toBe('')
  })
})

describe('duracion', () => {
  it('28 minutos', () => {
    expect(duracion(28)).toBe('28 min')
  })
  it('980 minutos → "16 h 20 min"', () => {
    expect(duracion(980)).toBe('16 h 20 min')
  })
  it('4000 minutos → "2 días 18 h" (con días, sin minutos)', () => {
    expect(duracion(4000)).toBe('2 días 18 h')
  })
  it('60 minutos → "1 h"', () => {
    expect(duracion(60)).toBe('1 h')
  })
  it('un día justo → "1 día"', () => {
    expect(duracion(1440)).toBe('1 día')
  })
  it('un día y 3 horas → "1 día 3 h"', () => {
    expect(duracion(1440 + 180)).toBe('1 día 3 h')
  })
  it('cero o negativo → "0 min"', () => {
    expect(duracion(0)).toBe('0 min')
    expect(duracion(-5)).toBe('0 min')
  })
  it('redondea hacia abajo los minutos sueltos', () => {
    expect(duracion(28.9)).toBe('28 min')
  })
})

describe('textoVencimiento — textos de la spec "Próximo paso"', () => {
  it('vencida hace 1 h', () => {
    expect(textoVencimiento({ due_date: '2026-11-25', due_time: '09:40' }, ahora)).toEqual({ texto: 'Vencida hace 1 h', estado: 'vencida' })
  })
  it('hoy a las 17:00 que todavía no llegó', () => {
    expect(textoVencimiento({ due_date: '2026-11-25', due_time: '17:00:00' }, ahora)).toEqual({ texto: 'Hoy 17:00', estado: 'hoy' })
  })
  it('hoy, todo el día (cuando la fila lo pide)', () => {
    expect(textoVencimiento({ due_date: '2026-11-25', due_time: null }, ahora, { todoElDia: true })).toEqual({
      texto: 'Hoy, todo el día',
      estado: 'hoy',
    })
  })
  it('mañana a las 9:00', () => {
    expect(textoVencimiento({ due_date: '2026-11-26', due_time: '09:00' }, ahora).texto).toBe('Mañana 9:00')
  })
  it('mañana, todo el día (tasación sin hora)', () => {
    expect(textoVencimiento({ due_date: '2026-11-26', due_time: null }, ahora, { todoElDia: true }).texto).toBe('Mañana, todo el día')
  })
  it('vie 27 nov, 9:00', () => {
    expect(textoVencimiento({ due_date: '2026-11-27', due_time: '09:00' }, ahora).texto).toBe('vie 27 nov, 9:00')
  })
  it('otro día, todo el día', () => {
    expect(textoVencimiento({ due_date: '2026-11-30', due_time: null }, ahora, { todoElDia: true }).texto).toBe('lun 30 nov, todo el día')
  })
  it('sin fecha', () => {
    expect(textoVencimiento({ due_date: null, due_time: null }, ahora, { todoElDia: true })).toEqual({ texto: 'Sin fecha', estado: 'sinfecha' })
  })
  it('sin la opción, la ficha sigue viendo "Hoy" a secas', () => {
    expect(textoVencimiento({ due_date: '2026-11-25', due_time: null }, ahora).texto).toBe('Hoy')
  })
  it('la tasación de hace 3 días sin hora → "Vencida hace 3 días"', () => {
    expect(textoVencimiento({ due_date: '2026-11-22', due_time: null }, ahora, { todoElDia: true }).texto).toBe('Vencida hace 3 días')
  })
  it('primera llamada de un lead que entró en horario: "Espera hace 28 min"', () => {
    // Se registró a las 10:12 de Argentina (13:12 UTC); la tarea vence en el registro.
    const v = textoVencimiento({ due_date: '2026-11-25', due_time: '10:12' }, ahora, {
      espera: { registradoEn: '2026-11-25T13:12:00Z' },
    })
    expect(v).toEqual({ texto: 'Espera hace 28 min', estado: 'vencida' })
  })
  it('la espera larga se dice en horas y días', () => {
    const v = textoVencimiento({ due_date: '2026-11-24', due_time: '17:20' }, ahora, {
      espera: { registradoEn: '2026-11-24T20:20:00Z' },
    })
    expect(v.texto).toBe('Espera hace 17 h 20 min')
  })
  it('lead que entró fuera de horario: vence a las 9:00 del día hábil y dice "Vencida hace 1 h"', () => {
    // Entró el martes a las 22:00; la tarea vence el miércoles 9:00 (sin `espera`).
    expect(textoVencimiento({ due_date: '2026-11-25', due_time: '09:00' }, new Date('2026-11-25T13:05:00Z')).texto).toBe('Vencida hace 1 h')
  })
  it('lead que entró fuera de horario, antes de las 9:00 → "Hoy 9:00" (todavía no venció)', () => {
    expect(textoVencimiento({ due_date: '2026-11-25', due_time: '09:00' }, new Date('2026-11-25T11:00:00Z'))).toEqual({
      texto: 'Hoy 9:00',
      estado: 'hoy',
    })
  })
  it('con `espera` pero todavía no vencida, no inventa una espera', () => {
    const v = textoVencimiento({ due_date: '2026-11-25', due_time: '11:00' }, ahora, { espera: { registradoEn: '2026-11-25T14:00:00Z' } })
    expect(v.estado).toBe('hoy')
  })
  it('decide si venció igual que vencimientoDeTarea en todos los casos', () => {
    const casos: { due_date: string | null; due_time: string | null }[] = [
      { due_date: null, due_time: null },
      { due_date: '2026-11-25', due_time: '09:40' },
      { due_date: '2026-11-25', due_time: '10:39' },
      { due_date: '2026-11-25', due_time: '10:41' },
      { due_date: '2026-11-25', due_time: null },
      { due_date: '2026-11-24', due_time: null },
      { due_date: '2026-11-26', due_time: '09:00' },
      { due_date: 'no-es', due_time: null },
    ]
    for (const t of casos) {
      for (const opciones of [undefined, { todoElDia: true }, { espera: { registradoEn: '2026-11-25T13:12:00Z' } }]) {
        const estado = textoVencimiento(t, ahora, opciones).estado
        expect(estado === 'vencida').toBe(vencimientoDeTarea(t, ahora).vencida)
      }
    }
  })
})

describe('minutosHabilesEntre (lunes a viernes, 10:00 a 14:00 de Argentina, crm-cadencia-paula)', () => {
  const ar = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-03:00`)
  it('el horario es el de la coordinación: de 10:00 a 14:00 (dueño, 2026-11-28)', () => {
    expect(HORARIO_LABORAL.fin).toBe('14:00')
    expect(HORARIO_LABORAL.inicio).toBe('10:00')
  })
  it('dentro del horario: 28 minutos', () => {
    expect(minutosHabilesEntre(ar('2026-11-25', '10:12'), ar('2026-11-25', '10:40'))).toBe(28)
  })
  it('cruzando la noche: de las 13:20 a las 10:40 del día siguiente son 1 h 20 min hábiles', () => {
    expect(minutosHabilesEntre(ar('2026-11-24', '13:20'), ar('2026-11-25', '10:40'))).toBe(80)
  })
  it('cruzando la noche hasta las 12:00 suma la mañana', () => {
    expect(minutosHabilesEntre(ar('2026-11-24', '17:00'), ar('2026-11-25', '12:00'))).toBe(120)
  })
  it('de viernes 13:00 a lunes 10:30: 1 h 30 min', () => {
    expect(minutosHabilesEntre(ar('2026-11-27', '13:00'), ar('2026-11-30', '10:30'))).toBe(90)
  })
  it('un sábado entero no suma nada', () => {
    expect(minutosHabilesEntre(ar('2026-11-28', '00:00'), ar('2026-11-29', '00:00'))).toBe(0)
  })
  it('después de las 14:00 no suma', () => {
    expect(minutosHabilesEntre(ar('2026-11-25', '14:00'), ar('2026-11-25', '23:00'))).toBe(0)
  })
  it('un día hábil completo son 240 minutos', () => {
    expect(minutosHabilesEntre(ar('2026-11-25', '00:00'), ar('2026-11-26', '00:00'))).toBe(240)
  })
  it('hasta antes que desde → 0', () => {
    expect(minutosHabilesEntre(ar('2026-11-25', '12:00'), ar('2026-11-25', '10:00'))).toBe(0)
  })
  it('una semana entera (lunes a lunes) son 5 días hábiles', () => {
    expect(minutosHabilesEntre(ar('2026-11-23', '00:00'), ar('2026-11-30', '00:00'))).toBe(5 * 240)
  })
  it('instantes inválidos → 0', () => {
    expect(minutosHabilesEntre(new Date('x'), ar('2026-11-25', '10:00'))).toBe(0)
  })
})
