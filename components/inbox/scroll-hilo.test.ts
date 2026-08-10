import { describe, it, expect } from 'vitest'
import {
  estaCercaDelFinal,
  nuevosSinVer,
  debeBajarSolo,
  MARGEN_CERCA_DEL_FINAL_PX,
} from './scroll-hilo'

describe('estaCercaDelFinal — el margen', () => {
  const alto = 600

  function medidas(distanciaAlFondo: number) {
    return { scrollTop: 2000 - distanciaAlFondo, scrollHeight: 2000 + alto, clientHeight: alto }
  }

  it('pegado al fondo: sí', () => {
    expect(estaCercaDelFinal(medidas(0))).toBe(true)
  })

  it('justo en el margen: sí; un píxel más arriba: no', () => {
    expect(estaCercaDelFinal(medidas(MARGEN_CERCA_DEL_FINAL_PX))).toBe(true)
    expect(estaCercaDelFinal(medidas(MARGEN_CERCA_DEL_FINAL_PX + 1))).toBe(false)
  })

  it('leyendo bien arriba: no', () => {
    expect(estaCercaDelFinal({ scrollTop: 0, scrollHeight: 4000, clientHeight: 600 })).toBe(false)
  })

  it('un hilo más corto que la pantalla siempre cuenta como "al final"', () => {
    // Si no, en una conversación de dos mensajes el botón de bajar aparecería
    // solo y sin nada adónde ir.
    expect(estaCercaDelFinal({ scrollTop: 0, scrollHeight: 300, clientHeight: 600 })).toBe(true)
  })
})

describe('nuevosSinVer — el contador del botón', () => {
  it('leyendo para arriba, suma los que van llegando', () => {
    expect(nuevosSinVer(0, 1)).toBe(1)
    expect(nuevosSinVer(1, 2)).toBe(3)
  })

  it('un refresco sin mensajes nuevos no toca el contador', () => {
    // El hilo se re-consulta cada 15 segundos: si esto sumara, el botón diría
    // cualquier número al rato de estar quieto.
    expect(nuevosSinVer(4, 0)).toBe(4)
    expect(nuevosSinVer(4, -1)).toBe(4)
  })

  // El "volver a cero" NO vive acá a propósito (ver el comentario de la
  // función): lo hace el manejador de scroll cuando el hilo vuelve al final, y
  // eso se prueba renderizando, en `ChatThread.test.tsx`.
})

describe('debeBajarSolo', () => {
  it('al abrir la conversación baja siempre, aunque el scroll diga otra cosa', () => {
    expect(debeBajarSolo(true, false)).toBe(true)
  })

  it('ya abierta: baja solo si el asesor estaba mirando el final', () => {
    expect(debeBajarSolo(false, true)).toBe(true)
    expect(debeBajarSolo(false, false)).toBe(false)
  })
})
