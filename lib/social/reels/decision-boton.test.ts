import { describe, it, expect } from 'vitest'
import { decidirBoton, type AjustesGlobales, type ReelParaBoton } from './decision'

const todoPrendido: AjustesGlobales = { automatizacion_habilitada: true, dm_habilitado: true, cuentas_de_prueba: [] }
const reelOk: ReelParaBoton = { automatizacion_activa: true, simulacro: false, estado: 'publicado' }

describe('decidirBoton', () => {
  it('con todo en orden manda el enlace', () => {
    expect(decidirBoton(reelOk, todoPrendido, false)).toEqual({ accion: 'mandar_enlace' })
  })

  it('el interruptor global apagado lo frena', () => {
    expect(decidirBoton(reelOk, { ...todoPrendido, automatizacion_habilitada: false }, false))
      .toEqual({ accion: 'ignorar', motivo: 'automatizacion_global_apagada' })
  })

  it('con los privados deshabilitados no manda nada', () => {
    expect(decidirBoton(reelOk, { ...todoPrendido, dm_habilitado: false }, false))
      .toEqual({ accion: 'ignorar', motivo: 'dm_deshabilitado' })
  })

  it('un reel APAGADO deja de mandar el enlace', () => {
    // El caso que motivó este módulo: el botón vive en un mensaje que ya está
    // en el teléfono de la persona y se puede tocar días después. Si el asesor
    // apagó ese reel en el medio, apagar tiene que significar apagar — antes
    // solo se miraban los interruptores globales y el enlace salía igual.
    expect(decidirBoton({ ...reelOk, automatizacion_activa: false }, todoPrendido, false))
      .toEqual({ accion: 'ignorar', motivo: 'reel_sin_automatizacion' })
  })

  it('en simulacro no manda el enlace', () => {
    expect(decidirBoton({ ...reelOk, simulacro: true }, todoPrendido, false))
      .toEqual({ accion: 'ignorar', motivo: 'simulacro' })
  })

  it('un reel que ya no está publicado no manda nada', () => {
    expect(decidirBoton({ ...reelOk, estado: 'fallido' }, todoPrendido, false))
      .toEqual({ accion: 'ignorar', motivo: 'reel_no_publicado' })
  })

  it('no le manda el enlace dos veces a la misma persona', () => {
    // Meta REINTENTA sus avisos: sin este freno, un solo toque de botón
    // terminaba mandando el enlace dos veces.
    expect(decidirBoton(reelOk, todoPrendido, true))
      .toEqual({ accion: 'ignorar', motivo: 'enlace_ya_enviado' })
  })
})
