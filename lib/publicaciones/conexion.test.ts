import { describe, expect, it } from 'vitest'
import { automatizacionPorDefecto } from './automatizacion'
import { planDeConexion } from './conexion'

const AHORA = new Date('2026-11-04T15:00:00Z')
const auto = { ...automatizacionPorDefecto(), palabras: 'doblas', modo: 'en_vivo' as const }
const base = {
  video: { id: 'v1', property_id: 'p1', automatizacion: auto, reel_id: null, descripcion: 'Texto\n\nComentá «DOBLAS»…' },
  landingPublicada: true,
  ahora: AHORA,
}

describe('planDeConexion', () => {
  it('sin propiedad no se conecta nada', () => {
    expect(planDeConexion({ ...base, video: { ...base.video, property_id: null }, red: { plataforma: 'instagram', igMediaId: 'm1' } })).toEqual({
      accion: 'nada',
      motivo: 'sin_propiedad',
    })
  })

  it('sin configuración no se conecta nada', () => {
    expect(planDeConexion({ ...base, video: { ...base.video, automatizacion: null }, red: { plataforma: 'instagram', igMediaId: 'm1' } }).accion).toBe('nada')
  })

  it('al salir en Instagram crea el reel con los textos, el modo y la hora de activación', () => {
    const p = planDeConexion({ ...base, red: { plataforma: 'instagram', igMediaId: 'm1' } })
    expect(p).toMatchObject({
      accion: 'crear',
      fila: {
        property_id: 'p1',
        origen: 'existente',
        estado: 'publicado',
        ig_media_id: 'm1',
        palabra_clave: 'doblas',
        automatizacion_activa: true,
        simulacro: false,
        automatizacion_desde: AHORA.toISOString(),
        respuestas_con_privado: auto.respuestas_con_privado,
        dm_boton: auto.dm_boton,
      },
    })
  })

  it('si el video ya tiene su reel (salió primero en la otra red), lo completa con el id de esta', () => {
    const p = planDeConexion({ ...base, video: { ...base.video, reel_id: 'r9' }, red: { plataforma: 'facebook', fbVideoId: 'fv', fbPostId: 'PAG_po' } })
    expect(p).toEqual({ accion: 'completar', reelId: 'r9', cambios: { fb_video_id: 'fv', fb_post_id: 'PAG_po' } })
  })

  it('al salir solo en Facebook crea el reel sin media de Instagram', () => {
    const p = planDeConexion({ ...base, red: { plataforma: 'facebook', fbVideoId: 'fv', fbPostId: 'PAG_po' } })
    expect(p).toMatchObject({ accion: 'crear', fila: { ig_media_id: null, fb_video_id: 'fv', fb_post_id: 'PAG_po' } })
  })

  it('sin landing publicada se conecta APAGADO y lo dice (el botón del privado no tendría adónde llevar)', () => {
    const p = planDeConexion({ ...base, landingPublicada: false, red: { plataforma: 'instagram', igMediaId: 'm1' } })
    expect(p).toMatchObject({
      accion: 'crear',
      fila: { automatizacion_activa: false, automatizacion_desde: null },
      aviso: expect.stringMatching(/landing/),
    })
  })

  it('Modo prueba queda activo y en simulacro', () => {
    const p = planDeConexion({ ...base, video: { ...base.video, automatizacion: { ...auto, modo: 'prueba' } }, red: { plataforma: 'instagram', igMediaId: 'm1' } })
    expect(p).toMatchObject({ fila: { automatizacion_activa: true, simulacro: true } })
  })

  it('Apagado queda sin activar y sin hora de activación', () => {
    const p = planDeConexion({ ...base, video: { ...base.video, automatizacion: { ...auto, modo: 'apagado' } }, red: { plataforma: 'instagram', igMediaId: 'm1' } })
    expect(p).toMatchObject({ fila: { automatizacion_activa: false, automatizacion_desde: null } })
  })

  it('una configuración guardada que ya no es válida no se conecta (y lo explica)', () => {
    const p = planDeConexion({ ...base, video: { ...base.video, automatizacion: { ...auto, palabras: '' } }, red: { plataforma: 'instagram', igMediaId: 'm1' } })
    expect(p).toMatchObject({ accion: 'nada', motivo: 'configuracion_invalida' })
  })

  it('sin el id de la red no hay con qué conectar', () => {
    expect(planDeConexion({ ...base, red: { plataforma: 'instagram', igMediaId: '' } })).toMatchObject({ accion: 'nada', motivo: 'sin_id_de_la_red' })
  })
})
