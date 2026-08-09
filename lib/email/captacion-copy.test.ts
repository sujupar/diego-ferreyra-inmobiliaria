import { describe, it, expect } from 'vitest'
import { copyCaptacion } from './captacion-copy'

const direccion = 'Rivadavia 4820'

describe('copyCaptacion', () => {
  it('con el abogado aprobado, nombra al abogado y mantiene el "100%"', () => {
    const c = copyCaptacion({ documentacionAprobada: true, nombreAbogado: 'Dra. Suárez', direccion })
    expect(c.fraseEstado).toContain('Dra. Suárez aprobó')
    expect(c.fraseEstado).toContain('documentación legal')
    expect(c.asuntoEquipo('Carla')).toBe('Nueva captación al 100% — Rivadavia 4820 (Carla)')
  })

  it('aprobada sin nombre de abogado no inventa un autor', () => {
    const c = copyCaptacion({ documentacionAprobada: true, nombreAbogado: null, direccion })
    expect(c.fraseEstado).toContain('Se aprobó toda la documentación legal')
  })

  /**
   * El bug que se arregla en este cambio: sin este branch, una propiedad
   * captada solo con fotos recibía un mail afirmando que la documentación
   * estaba aprobada. Afirmar algo falso es peor que no mandar nada.
   */
  it('SIN documentación aprobada, nunca afirma que se aprobó nada', () => {
    const c = copyCaptacion({ documentacionAprobada: false, nombreAbogado: null, direccion })
    expect(c.fraseEstado).not.toMatch(/aprob/i)
    expect(c.titulo).not.toContain('100%')
    expect(c.asuntoEquipo('Carla')).not.toContain('100%')
    expect(c.cierreAsesor).not.toMatch(/aprob/i)
  })

  it('sin documentación, dice que quedó captada y que se puede difundir', () => {
    const c = copyCaptacion({ documentacionAprobada: false, nombreAbogado: null, direccion })
    expect(c.fraseEstado).toContain('captada')
    expect(c.fraseEstado).toMatch(/difundir|publicar/)
    expect(c.fraseEstado).toContain('no es obligatoria')
  })

  it('sin documentación, el recordatorio de subirla va primero en los próximos pasos', () => {
    const c = copyCaptacion({ documentacionAprobada: false, nombreAbogado: null, direccion })
    expect(c.proximosPasos[0]).toMatch(/documentación/i)
    // Con los papeles listos, ese paso no existe.
    const aprobada = copyCaptacion({ documentacionAprobada: true, nombreAbogado: null, direccion })
    expect(aprobada.proximosPasos.some(p => /enviala al abogado/i.test(p))).toBe(false)
  })

  it('el asunto del equipo avisa que la documentación está pendiente', () => {
    const c = copyCaptacion({ documentacionAprobada: false, nombreAbogado: 'Dra. Suárez', direccion })
    expect(c.asuntoEquipo('Carla')).toContain('documentación pendiente')
    // Y no menciona al abogado: no revisó nada.
    expect(c.fraseEstado).not.toContain('Dra. Suárez')
  })
})
