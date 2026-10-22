import { describe, it, expect } from 'vitest'
import { decidirRespaldo } from './respaldo'

const BASE = {
  estado: 'failed',
  codigoError: '131049',
  plantillaDelMensaje: 'encuesta_visita_v4',
  waMessageIdFallido: 'wamid.A',
  encuesta: { waMessageIdActual: 'wamid.A', completada: false, vencida: false },
}

describe('decidirRespaldo: cuándo la invitación de marketing se reemplaza por la de utilidad', () => {
  it('Meta frenó la v4 por el tope de marketing (131049) → manda la de utilidad (v6)', () => {
    expect(decidirRespaldo(BASE)).toEqual({ mandar: true, plantilla: 'encuesta_visita_v6' })
  })
  it('también si la persona bloqueó los mensajes de marketing (131050)', () => {
    expect(decidirRespaldo({ ...BASE, codigoError: '131050' })).toEqual({ mandar: true, plantilla: 'encuesta_visita_v6' })
  })
  it('otro error (número inválido, plantilla rota) NO tiene respaldo: fallaría igual', () => {
    expect(decidirRespaldo({ ...BASE, codigoError: '131026' })).toEqual({ mandar: false, motivo: 'error_sin_respaldo' })
    expect(decidirRespaldo({ ...BASE, codigoError: null })).toEqual({ mandar: false, motivo: 'error_sin_respaldo' })
  })
  it('solo ante un fallo: entregado o leído no dispara nada', () => {
    for (const estado of ['sent', 'delivered', 'read']) {
      expect(decidirRespaldo({ ...BASE, estado })).toEqual({ mandar: false, motivo: 'no_fallo' })
    }
  })
  it('una plantilla sin respaldo (la v6 misma —sin bucles—, la v3, la del regalo, cualquier otra) no dispara nada', () => {
    for (const plantillaDelMensaje of ['encuesta_visita_v6', 'encuesta_visita_v3', 'encuesta_visita_v1', 'regalo_visita_v3', 'consulta_portal_v2', null]) {
      expect(decidirRespaldo({ ...BASE, plantillaDelMensaje })).toEqual({ mandar: false, motivo: 'plantilla_sin_respaldo' })
    }
  })
  it('una sola vez: si la encuesta ya apunta a otro mensaje (el respaldo salió), un reintento de Meta no duplica', () => {
    expect(decidirRespaldo({ ...BASE, encuesta: { ...BASE.encuesta, waMessageIdActual: 'wamid.B' } }))
      .toEqual({ mandar: false, motivo: 'ya_reemplazado' })
  })
  it('sin encuesta asociada a ese mensaje, nada', () => {
    expect(decidirRespaldo({ ...BASE, encuesta: null })).toEqual({ mandar: false, motivo: 'sin_encuesta' })
  })
  it('ya respondida o vencida: no se le vuelve a escribir', () => {
    expect(decidirRespaldo({ ...BASE, encuesta: { ...BASE.encuesta, completada: true } })).toEqual({ mandar: false, motivo: 'ya_respondio' })
    expect(decidirRespaldo({ ...BASE, encuesta: { ...BASE.encuesta, vencida: true } })).toEqual({ mandar: false, motivo: 'vencida' })
  })
})
