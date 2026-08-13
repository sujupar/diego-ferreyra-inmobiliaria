import { describe, it, expect } from 'vitest'
import {
  coerceTasacionDecision,
  aplicarDecision,
  buildTasacionUserPrompt,
  resumenParaEquipo,
  CIERRE_TEXTUAL,
  type TasacionDecision,
  type EstadoTasacion,
} from './tasacion-brain'

const DECISION: TasacionDecision = {
  reply: 'Perfecto, ¿qué días y horarios tenés disponibles?',
  disponibilidad: null,
  direccion: null,
  prefiereLlamada: false,
  derivar: false,
  summary: 'Pidió tasación, se le preguntó la disponibilidad.',
  priorityScore: 30,
  priorityReason: 'Esperando disponibilidad',
  suggestedNextStep: 'Esperar respuesta',
}

describe('el código decide qué pasa, no el modelo', () => {
  it('con un solo dato NO cierra ni avisa al equipo', () => {
    const r = aplicarDecision({}, { ...DECISION, disponibilidad: 'el jueves a la tarde' })
    expect(r.estado.cerrado).toBeFalsy()
    expect(r.avisarEquipo).toBe(false)
  })

  it('con cuándo Y dónde cierra y avisa', () => {
    const r = aplicarDecision(
      { disponibilidad: 'el jueves a la tarde' },
      { ...DECISION, direccion: 'Cabildo 2200, Belgrano' },
    )
    expect(r.estado.cerrado).toBe(true)
    expect(r.avisarEquipo).toBe(true)
    expect(r.motivo).toBe('datos_completos')
  })

  it('aunque el modelo escriba la frase de cierre antes de tiempo, el caso NO se cierra', () => {
    // El modelo puede adelantarse; los datos mandan.
    const r = aplicarDecision({}, { ...DECISION, reply: CIERRE_TEXTUAL })
    expect(r.estado.cerrado).toBeFalsy()
    expect(r.avisarEquipo).toBe(false)
  })

  it('un dato ya capturado no se pierde si el modelo lo omite en el turno siguiente', () => {
    const previo: EstadoTasacion = { disponibilidad: 'el jueves a la tarde' }
    const r = aplicarDecision(previo, { ...DECISION, disponibilidad: null })
    expect(r.estado.disponibilidad).toBe('el jueves a la tarde')
  })

  it('pedir llamada cierra en un paso', () => {
    const r = aplicarDecision({}, { ...DECISION, prefiereLlamada: true })
    expect(r.estado.cerrado).toBe(true)
    expect(r.motivo).toBe('pidio_llamada')
  })

  it('derivar cierra y marca que sigue una persona', () => {
    const r = aplicarDecision({ disponibilidad: 'jueves' }, { ...DECISION, derivar: true })
    expect(r.estado.derivado).toBe(true)
    expect(r.estado.cerrado).toBe(true)
    expect(r.motivo).toBe('derivado')
  })

  it('cuenta los mensajes enviados solo cuando hubo respuesta', () => {
    const conRespuesta = aplicarDecision({ enviados: 2 }, DECISION)
    expect(conRespuesta.estado.enviados).toBe(3)
    const sinRespuesta = aplicarDecision({ enviados: 2 }, { ...DECISION, reply: null })
    expect(sinRespuesta.estado.enviados).toBe(2)
  })
})

describe('lo que devuelve el modelo se valida antes de usarlo', () => {
  it('descarta una respuesta sin lo mínimo', () => {
    expect(coerceTasacionDecision(null)).toBeNull()
    expect(coerceTasacionDecision({ reply: 'hola' })).toBeNull() // sin summary
  })

  it('trata los rellenos del modelo como "no hay dato"', () => {
    for (const relleno of ['null', 'N/A', 'no dijo', '  ', 'desconocido']) {
      const d = coerceTasacionDecision({ summary: 's', disponibilidad: relleno })
      expect(d?.disponibilidad, `"${relleno}" debería contar como vacío`).toBeNull()
    }
  })

  it('conserva una disponibilidad dicha de forma suelta', () => {
    const d = coerceTasacionDecision({ summary: 's', disponibilidad: 'mañana tipo 10' })
    expect(d?.disponibilidad).toBe('mañana tipo 10')
  })

  it('acota la prioridad y recorta la respuesta larga', () => {
    const d = coerceTasacionDecision({ summary: 's', priorityScore: 500, reply: 'x'.repeat(900) })
    expect(d?.priorityScore).toBe(100)
    expect(d?.reply?.length).toBe(600)
  })

  it('una respuesta vacía es "no contestar"', () => {
    expect(coerceTasacionDecision({ summary: 's', reply: '   ' })?.reply).toBeNull()
  })
})

describe('el prompt le dice al modelo lo que ya tiene', () => {
  const base = {
    clientName: 'Julián',
    todayISO: '2026-08-13',
    previousSummary: '',
    newMessages: [{ from: 'cliente' as const, text: 'Coordinar por acá' }],
    ultimoMensajePropio: null,
    agentMessagesSent: 0,
    maxMessages: 6,
  }

  it('marca explícitamente que NO vuelva a pedir un dato que ya tiene', () => {
    const p = buildTasacionUserPrompt({
      ...base,
      yaSabemos: { disponibilidad: 'el jueves a la tarde', direccion: null, prefiereLlamada: false },
    })
    expect(p).toMatch(/YA LO TENÉS/)
    expect(p).toMatch(/el jueves a la tarde/)
    expect(p).toMatch(/todavía no la dio/)
  })

  it('avisa cuando corresponde cerrar', () => {
    const p = buildTasacionUserPrompt({
      ...base,
      yaSabemos: { disponibilidad: 'jueves', direccion: 'Cabildo 2200', prefiereLlamada: false },
    })
    expect(p).toMatch(/TENÉS LOS DOS DATOS/)
  })

  it('al llegar al tope le dice que no conteste', () => {
    const p = buildTasacionUserPrompt({
      ...base,
      agentMessagesSent: 6,
      yaSabemos: { disponibilidad: null, direccion: null, prefiereLlamada: false },
    })
    expect(p).toMatch(/"reply" va en null/)
  })
})

describe('lo que lee el asesor', () => {
  it('dice qué falta cuando falta', () => {
    expect(resumenParaEquipo({ disponibilidad: 'jueves' })).toMatch(/no dio la dirección/)
  })
  it('la llamada es lo único que importa si pidió llamada', () => {
    expect(resumenParaEquipo({ prefiereLlamada: true })).toMatch(/llamen/i)
  })
})
