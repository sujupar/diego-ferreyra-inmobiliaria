import { describe, it, expect } from 'vitest'
import { urlDelChat, accionAlCerrar } from './chat-url'

describe('urlDelChat — la conversación abierta vive en la URL', () => {
  it('abrir un chat deja el teléfono en `chat` y la pestaña en whatsapp', () => {
    expect(urlDelChat('/inbox', '', '5491122334455')).toBe('/inbox?tab=whatsapp&chat=5491122334455')
  })

  it('cerrar el chat saca `chat` pero se queda en la pestaña de WhatsApp', () => {
    expect(urlDelChat('/inbox', 'tab=whatsapp&chat=5491122334455', null)).toBe('/inbox?tab=whatsapp')
  })

  it('no pisa los demás parámetros (el deep link a un lead sigue vivo)', () => {
    const url = urlDelChat('/inbox', 'lead=abc-123', '5491122334455')
    expect(url).toContain('lead=abc-123')
    expect(url).toContain('chat=5491122334455')
  })

  it('cambiar de conversación reemplaza el teléfono, no lo acumula', () => {
    const url = urlDelChat('/inbox', 'tab=whatsapp&chat=111', '222')
    expect(url).toBe('/inbox?tab=whatsapp&chat=222')
  })

  it('fija `tab=whatsapp` aunque la URL venga de otra pestaña', () => {
    // Sin esto, volver atrás a una URL con `chat=` aterrizaría en Campañas.
    expect(urlDelChat('/inbox', 'tab=campanas', '999')).toBe('/inbox?tab=whatsapp&chat=999')
  })
})

describe('accionAlCerrar — el botón volver hace lo mismo que el gesto del teléfono', () => {
  it('si el chat se abrió desde la lista, cerrarlo deshace esa entrada de historial', () => {
    expect(accionAlCerrar(true)).toBe('atras')
  })

  it('si se entró directo por URL (link compartido, refresco), NO se va para atrás', () => {
    // Un `history.back()` acá sacaría al usuario de la aplicación.
    expect(accionAlCerrar(false)).toBe('reemplazar')
  })
})
