import { describe, it, expect } from 'vitest'
import { siguienteTurno, resumenParaEquipo, type EstadoTasacion } from './tasacion-flow'

const INICIO: EstadoTasacion = { paso: 'esperando_canal' }

describe('camino feliz: coordinar por el chat', () => {
  it('toca el botón "Coordinar por acá" → le pregunta cuándo', () => {
    const t = siguienteTurno(INICIO, 'Coordinar por acá')
    expect(t.estado.paso).toBe('esperando_dia_hora')
    expect(t.estado.canal).toBe('chat')
    expect(t.respuesta).toMatch(/qué día y en qué horario/i)
    expect(t.avisarEquipo).toBe(false)
  })

  it('responde cuándo → le pregunta la dirección y GUARDA lo que dijo', () => {
    const t = siguienteTurno({ paso: 'esperando_dia_hora', canal: 'chat' }, 'el jueves a la tarde')
    expect(t.estado.paso).toBe('esperando_direccion')
    expect(t.estado.diaHora).toBe('el jueves a la tarde')
    expect(t.respuesta).toMatch(/dirección y el barrio/i)
  })

  it('responde la dirección → cierra con el texto del dueño y avisa al equipo', () => {
    const t = siguienteTurno(
      { paso: 'esperando_direccion', canal: 'chat', diaHora: 'el jueves a la tarde' },
      'Av. Cabildo 2200, Belgrano',
    )
    expect(t.estado.paso).toBe('cerrado')
    expect(t.estado.direccion).toBe('Av. Cabildo 2200, Belgrano')
    expect(t.avisarEquipo).toBe(true)
    expect(t.motivo).toBe('datos_completos')
    // NO promete un horario en firme: dice que el asesor confirma.
    expect(t.respuesta).toMatch(/asesor/i)
    expect(t.respuesta).toMatch(/confirmar la visita/i)
    expect(t.respuesta).toMatch(/disponibilidad/i)
  })
})

describe('camino: prefiere que lo llamen', () => {
  it('cierra en un solo paso y avisa al equipo', () => {
    const t = siguienteTurno(INICIO, 'Prefiero que me llamen')
    expect(t.estado.canal).toBe('llamada')
    expect(t.estado.paso).toBe('cerrado')
    expect(t.avisarEquipo).toBe(true)
    expect(t.motivo).toBe('pidio_llamada')
    expect(t.respuesta).toMatch(/asesor/i)
  })

  it('también entiende cuando lo escribe a mano', () => {
    expect(siguienteTurno(INICIO, 'llamame mejor').estado.canal).toBe('llamada')
    expect(siguienteTurno(INICIO, 'prefiero por telefono').estado.canal).toBe('llamada')
  })
})

describe('se sale del guion → contesta una persona', () => {
  it('una pregunta deriva y el agente deja de escribir', () => {
    const t = siguienteTurno(INICIO, '¿cuánto cobran de comisión?')
    expect(t.estado.paso).toBe('derivado')
    expect(t.avisarEquipo).toBe(true)
    expect(t.motivo).toBe('derivado')
    expect(t.respuesta).toMatch(/asesor/i)
  })

  it('deriva también en medio del guion, sin inventar respuestas', () => {
    const t = siguienteTurno({ paso: 'esperando_dia_hora', canal: 'chat' }, '¿la tasación es realmente gratis?')
    expect(t.estado.paso).toBe('derivado')
  })

  it('un pedido de baja NO se trata como si fuera una fecha', () => {
    const t = siguienteTurno({ paso: 'esperando_dia_hora', canal: 'chat' }, 'no me interesa, cancelar')
    expect(t.estado.paso).toBe('derivado')
    expect(t.estado.diaHora).toBeUndefined()
  })
})

describe('nunca vuelve a escribir en una conversación terminada', () => {
  it('cerrada: se queda callado aunque el cliente escriba', () => {
    const t = siguienteTurno({ paso: 'cerrado', canal: 'chat' }, 'gracias!')
    expect(t.respuesta).toBeNull()
    expect(t.avisarEquipo).toBe(false)
  })

  it('derivada: sigue la persona, el agente no interrumpe', () => {
    const t = siguienteTurno({ paso: 'derivado' }, 'hola?')
    expect(t.respuesta).toBeNull()
  })

  it('un mensaje vacío no mueve nada', () => {
    const t = siguienteTurno(INICIO, '   ')
    expect(t.respuesta).toBeNull()
    expect(t.estado.paso).toBe('esperando_canal')
  })
})

describe('resumen para el equipo', () => {
  it('llamada', () => {
    expect(resumenParaEquipo({ paso: 'cerrado', canal: 'llamada' })).toMatch(/prefiere que lo llamen/i)
  })
  it('datos completos', () => {
    const r = resumenParaEquipo({
      paso: 'cerrado', canal: 'chat', diaHora: 'jueves a la tarde', direccion: 'Cabildo 2200',
    })
    expect(r).toMatch(/jueves a la tarde/)
    expect(r).toMatch(/Cabildo 2200/)
  })
})
