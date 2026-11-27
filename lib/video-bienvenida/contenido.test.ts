import { describe, it, expect } from 'vitest'
import { CONTENIDO, vcardDePaula } from './contenido'

describe('contenido de la página del video', () => {
  it('titular con el nombre de pila', () => {
    expect(CONTENIDO.titular('Ana')).toBe('Ana, antes de tu tasación mirá este caso')
  })

  it('sin nombre, el titular no queda con una coma colgando', () => {
    expect(CONTENIDO.titular(null)).toBe('Antes de tu tasación, mirá este caso')
    expect(CONTENIDO.titular('   ')).toBe('Antes de tu tasación, mirá este caso')
  })

  it('no menciona la duración del video (pedido del dueño)', () => {
    const todo = JSON.stringify(CONTENIDO)
    expect(todo).not.toMatch(/\b\d{1,2}:\d{2}\b/)
    expect(todo).not.toMatch(/minutos/)
  })

  it('el WhatsApp va al número de la empresa con el texto listo', () => {
    expect(CONTENIDO.whatsapp.url).toBe(
      'https://wa.me/5491139070865?text=Hola%2C%20ya%20vi%20el%20video.%20Quiero%20coordinar%20la%20tasaci%C3%B3n.',
    )
  })

  it('la tarjeta de Paula tiene el nombre y el número de donde llama', () => {
    const v = vcardDePaula()
    expect(v).toMatch(/^BEGIN:VCARD\r\nVERSION:3\.0\r\n/)
    expect(v).toContain('FN:Paula · Diego Ferreyra Inmobiliaria')
    expect(v).toContain('TEL;TYPE=CELL:+5491122926434')
    expect(v.trimEnd().endsWith('END:VCARD')).toBe(true)
  })
})
