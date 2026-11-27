// Lo que la cartera le suma a ultimo-contacto.ts (crm-cartera-por-rol, design.md D3 y D5).
// Los tests de la cabecera de la ficha siguen en ultimo-contacto.test.ts, sin cambios.
import { describe, it, expect } from 'vitest'
import {
  INICIO_REGISTRO_CONTACTOS,
  anteriorAlRegistro,
  contactoRegistrado,
  masReciente,
  textoQueFue,
} from './ultimo-contacto'
import { RESULTADO_CORTO } from './actividades'
import { RESULTADOS_LLAMADA } from './tipos'

const fila = (p: Partial<Parameters<typeof contactoRegistrado>[0] & object>) => ({
  actividad_at: null,
  actividad_tipo: null,
  actividad_resultado: null,
  visita_at: null,
  ...p,
})

describe('contactoRegistrado', () => {
  it('sin fila → null', () => {
    expect(contactoRegistrado(null)).toBeNull()
  })
  it('todo nulo → null', () => {
    expect(contactoRegistrado(fila({}))).toBeNull()
  })
  it('solo una llamada', () => {
    expect(
      contactoRegistrado(fila({ actividad_at: '2026-11-25T13:00:00Z', actividad_tipo: 'call', actividad_resultado: 'no_atendio' })),
    ).toEqual({ at: '2026-11-25T13:00:00Z', que: 'llamada', resultado: 'no_atendio' })
  })
  it('solo un WhatsApp marcado', () => {
    expect(contactoRegistrado(fila({ actividad_at: '2026-11-25T13:00:00Z', actividad_tipo: 'whatsapp_sent' }))).toEqual({
      at: '2026-11-25T13:00:00Z',
      que: 'whatsapp',
      resultado: null,
    })
  })
  it('solo una visita', () => {
    expect(contactoRegistrado(fila({ visita_at: '2026-11-20T15:00:00Z' }))).toEqual({
      at: '2026-11-20T15:00:00Z',
      que: 'visita',
      resultado: null,
    })
  })
  it('las dos, con la visita más nueva → la visita', () => {
    const r = contactoRegistrado(
      fila({ actividad_at: '2026-11-13T15:00:00Z', actividad_tipo: 'call', actividad_resultado: 'agendo', visita_at: '2026-11-21T15:00:00Z' }),
    )
    expect(r).toEqual({ at: '2026-11-21T15:00:00Z', que: 'visita', resultado: null })
  })
  it('las dos, con la llamada más nueva → la llamada', () => {
    const r = contactoRegistrado(
      fila({ actividad_at: '2026-11-24T15:00:00Z', actividad_tipo: 'call', actividad_resultado: 'agendo', visita_at: '2026-11-21T15:00:00Z' }),
    )
    expect(r).toEqual({ at: '2026-11-24T15:00:00Z', que: 'llamada', resultado: 'agendo' })
  })
  it('compara instantes y no textos ("+00:00" con microsegundos contra "Z")', () => {
    const r = contactoRegistrado(
      fila({ actividad_at: '2026-11-25T10:00:00.123456+00:00', actividad_tipo: 'call', actividad_resultado: 'agendo', visita_at: '2026-11-25T09:00:00Z' }),
    )
    expect(r?.que).toBe('llamada')
  })
  it('empate exacto → la actividad registrada (dice más que la visita: qué se habló)', () => {
    const r = contactoRegistrado(
      fila({ actividad_at: '2026-11-21T15:00:00Z', actividad_tipo: 'whatsapp_sent', visita_at: '2026-11-21T15:00:00+00:00' }),
    )
    expect(r?.que).toBe('whatsapp')
  })
  it('un tipo de actividad desconocido se ignora (queda la visita)', () => {
    const r = contactoRegistrado(fila({ actividad_at: '2026-11-25T15:00:00Z', actividad_tipo: 'note', visita_at: '2026-11-20T15:00:00Z' }))
    expect(r).toEqual({ at: '2026-11-20T15:00:00Z', que: 'visita', resultado: null })
  })
  it('un tipo desconocido sin visita → null', () => {
    expect(contactoRegistrado(fila({ actividad_at: '2026-11-25T15:00:00Z', actividad_tipo: 'email' }))).toBeNull()
  })
  it('una llamada con un resultado que no existe queda sin resultado', () => {
    const r = contactoRegistrado(fila({ actividad_at: '2026-11-25T15:00:00Z', actividad_tipo: 'call', actividad_resultado: 'ocupado' }))
    expect(r).toEqual({ at: '2026-11-25T15:00:00Z', que: 'llamada', resultado: null })
  })
  it('un WhatsApp nunca trae resultado aunque la fila traiga uno', () => {
    const r = contactoRegistrado(fila({ actividad_at: '2026-11-25T15:00:00Z', actividad_tipo: 'whatsapp_sent', actividad_resultado: 'agendo' }))
    expect(r?.resultado).toBeNull()
  })
  it('una fecha de actividad ilegible se ignora', () => {
    const r = contactoRegistrado(fila({ actividad_at: 'no-es-fecha', actividad_tipo: 'call', actividad_resultado: 'agendo', visita_at: '2026-11-20T15:00:00Z' }))
    expect(r?.que).toBe('visita')
  })
  it('la cabecera de la ficha y la fila de la lista dan el mismo instante para la misma persona', () => {
    // Mirta Sosa: llamada hace 12 días, visita hace 4 (spec "Una visita cuenta").
    const ultimaLlamada = '2026-11-13T15:00:00Z'
    const visitas = ['2026-11-21T15:00:00Z', null]
    const cabecera = masReciente([ultimaLlamada, ...visitas]) // como lo arma lib/crm/ficha.ts
    const filaDeLista = contactoRegistrado(
      fila({ actividad_at: ultimaLlamada, actividad_tipo: 'call', actividad_resultado: 'no_atendio', visita_at: '2026-11-21T15:00:00Z' }),
    )
    expect(filaDeLista?.at).toBe(cabecera)
  })
})

describe('textoQueFue', () => {
  const esperados: Record<string, string> = {
    no_atendio: 'Llamada · no atendió',
    agendo: 'Llamada · agendó',
    volver_a_llamar: 'Llamada · volver a llamar',
    no_interesa: 'Llamada · no le interesa',
    numero_equivocado: 'Llamada · número equivocado',
  }
  for (const r of RESULTADOS_LLAMADA) {
    it(`llamada con resultado ${r} → "${esperados[r]}"`, () => {
      expect(textoQueFue({ at: '2026-11-25T15:00:00Z', que: 'llamada', resultado: r })).toBe(esperados[r])
    })
  }
  it('usa los mismos textos que la ficha (RESULTADO_CORTO), solo con minúscula inicial', () => {
    for (const r of RESULTADOS_LLAMADA) {
      const t = textoQueFue({ at: '2026-11-25T15:00:00Z', que: 'llamada', resultado: r })
      expect(t.toLowerCase()).toBe(`llamada · ${RESULTADO_CORTO[r].toLowerCase()}`)
    }
  })
  it('llamada sin resultado → "Llamada"', () => {
    expect(textoQueFue({ at: '2026-11-25T15:00:00Z', que: 'llamada', resultado: null })).toBe('Llamada')
  })
  it('WhatsApp → "WhatsApp enviado"', () => {
    expect(textoQueFue({ at: '2026-11-25T15:00:00Z', que: 'whatsapp', resultado: null })).toBe('WhatsApp enviado')
  })
  it('visita → "Visita de tasación"', () => {
    expect(textoQueFue({ at: '2026-11-25T15:00:00Z', que: 'visita', resultado: null })).toBe('Visita de tasación')
  })
})

describe('anteriorAlRegistro', () => {
  it('la fecha de inicio es el día del deploy de la ficha (respuesta 1 del dueño)', () => {
    expect(INICIO_REGISTRO_CONTACTOS).toBe('2026-11-26')
  })
  it('un día antes → anterior', () => {
    expect(anteriorAlRegistro('2026-11-25T15:00:00Z')).toBe(true)
  })
  it('el mismo día de inicio → no es anterior', () => {
    expect(anteriorAlRegistro('2026-11-26T15:00:00Z')).toBe(false)
  })
  it('las 00:30 de Argentina del día de inicio (03:30 UTC) → no es anterior', () => {
    expect(anteriorAlRegistro('2026-11-26T03:30:00Z')).toBe(false)
  })
  it('las 23:30 de Argentina del día anterior, que en UTC ya es el día de inicio → anterior', () => {
    // 2026-11-25 23:30 AR = 2026-11-26 02:30 UTC
    expect(anteriorAlRegistro('2026-11-26T02:30:00Z')).toBe(true)
  })
  it('septiembre de 2025 → anterior', () => {
    expect(anteriorAlRegistro('2025-09-12T13:00:00+00:00')).toBe(true)
  })
  it('una fecha posterior → no es anterior', () => {
    expect(anteriorAlRegistro('2026-12-03T13:00:00Z')).toBe(false)
  })
  it('una fecha ilegible no es anterior (del lado de avisar de más)', () => {
    expect(anteriorAlRegistro('no-es-fecha')).toBe(false)
  })
})
