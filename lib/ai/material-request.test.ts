import { describe, it, expect } from 'vitest'
import { materialPedidoExplicito } from './material-request'

/**
 * El caso que originó todo esto: el 6 de agosto de 2026 un cliente escribió
 * "Tienes los planos?" y el agente contestó "Plano no tengo a mano", teniendo el
 * plano cargado. Esta función es la garantía de que eso salga igual.
 */
describe('materialPedidoExplicito', () => {
  it('el mensaje real que rompió todo', () => {
    expect(materialPedidoExplicito('Tienes los planos?')).toEqual(['plano'])
  })

  it('reconoce las formas de pedir cada cosa', () => {
    expect(materialPedidoExplicito('¿Tenés fotos?')).toEqual(['fotos'])
    expect(materialPedidoExplicito('me pasás el video?')).toEqual(['video'])
    expect(materialPedidoExplicito('Mandame las imágenes por favor')).toEqual(['fotos'])
    expect(materialPedidoExplicito('quiero ver el recorrido')).toEqual(['video'])
    expect(materialPedidoExplicito('hay croquis?')).toEqual(['plano'])
  })

  it('entiende "cómo está distribuida" como un pedido de plano', () => {
    expect(materialPedidoExplicito('¿Me pasás cómo está distribuida?')).toContain('plano')
  })

  it('un pedido puede incluir dos cosas', () => {
    const r = materialPedidoExplicito('Tenés fotos y video?')
    expect(r).toContain('fotos')
    expect(r).toContain('video')
  })

  it('una MENCIÓN no es un pedido', () => {
    // Sin forma de pedido no se manda nada: nombrar algo no es pedirlo.
    expect(materialPedidoExplicito('Las fotos que vi me gustaron mucho')).toEqual([])
    expect(materialPedidoExplicito('gracias por el video')).toEqual([])
  })

  it('pide solo lo que pide, aunque nombre otra cosa al pasar', () => {
    const r = materialPedidoExplicito('Ya vi las fotos. ¿Tenés el plano?')
    expect(r).toEqual(['plano'])
  })

  it('un "no" de otra oración NO anula el pedido', () => {
    // Caso real de agenda: "no puedo el martes" no puede cancelar "pasame el plano".
    const r = materialPedidoExplicito('No puedo el martes. ¿Me pasás el plano?')
    expect(r).toEqual(['plano'])
  })

  it('respeta un rechazo explícito de material', () => {
    expect(materialPedidoExplicito('No me mandes más fotos por favor')).toEqual([])
  })

  it('no explota con vacío ni con basura', () => {
    expect(materialPedidoExplicito('')).toEqual([])
    expect(materialPedidoExplicito(null)).toEqual([])
    expect(materialPedidoExplicito(undefined)).toEqual([])
    expect(materialPedidoExplicito('👍')).toEqual([])
  })

  it('no confunde una pregunta de agenda con un pedido de material', () => {
    expect(materialPedidoExplicito('¿Qué día puedo ir a verla?')).toEqual([])
    expect(materialPedidoExplicito('¿Cuánto sale?')).toEqual([])
  })
})
