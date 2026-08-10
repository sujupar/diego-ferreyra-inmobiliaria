// @vitest-environment happy-dom
/**
 * El Inbox como app de mensajería (Fase 1 del sistema responsive), probado
 * RENDERIZANDO de verdad — no leyendo el archivo.
 *
 * Lo que se fija acá es lo que un asesor toca con el pulgar y que hasta ahora no
 * tenía ninguna red:
 *
 *   1. La conversación abierta vive en la URL. Sin esto, el gesto de volver del
 *      teléfono saca al usuario del Inbox entero (y el "tirar para recargar" de
 *      Android pierde la conversación).
 *   2. El botón de volver de la cabecera hace lo MISMO que ese gesto — deshace
 *      la entrada de historial que empujamos— salvo que se haya entrado directo
 *      por URL, donde un `back()` sacaría al usuario de la aplicación.
 *   3. En el teléfono, Enter NO manda el mensaje: hace salto de línea. Con Enter
 *      enviando, el asesor no puede escribir dos renglones sin mandar el primero
 *      por accidente. En escritorio el atajo se queda.
 *   4. Al cambiar de conversación, el hilo baja al último mensaje aunque las dos
 *      tengan la misma cantidad de mensajes.
 *
 * `InboxTabs` se renderiza entero (no `WhatsappClient` suelto) porque la mitad
 * del arreglo —el bloque de pestañas y título que desaparece— vive ahí, y las
 * dos mitades leen el MISMO parámetro de la URL.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { InboxTabs } from './InboxTabs'
import type { ConversationListItem, Thread } from '@/components/inbox/types'

// ── La URL, simulada como la sincroniza Next ────────────────────────────────
// Next parchea `history.pushState`/`replaceState` y hace que `useSearchParams`
// vea el valor nuevo. Acá se simula: los espías escriben en `busqueda` y el test
// vuelve a renderizar, que es cuando el mock la lee.
let busqueda = ''
const pushState = vi.fn((_s: unknown, _t: string, url: string) => {
  busqueda = url.includes('?') ? url.slice(url.indexOf('?') + 1) : ''
})
const replaceState = vi.fn((_s: unknown, _t: string, url: string) => {
  busqueda = url.includes('?') ? url.slice(url.indexOf('?') + 1) : ''
})
const back = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => '/inbox',
  useSearchParams: () => new URLSearchParams(busqueda),
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}))

// ── Datos ───────────────────────────────────────────────────────────────────
const TEL_A = '5491111111111'
const TEL_B = '5491122222222'

function conversacion(phone: string, nombre: string): ConversationListItem {
  return {
    phone_e164: phone,
    contact_name: nombre,
    lead_id: null,
    lead_number: null,
    property_id: null,
    property: null,
    advisor_id: null,
    advisor_name: null,
    last_message: 'Hola',
    last_direction: 'in',
    last_status: 'received',
    last_at: new Date().toISOString(),
    unread_count: 0,
  }
}

/** Con la ventana de 24hs cerrada, el aviso pasa a ser el largo (el que se compactó). */
let ventanaAbierta = true

function hilo(phone: string, cuantos: number): Thread {
  return {
    phone_e164: phone,
    contact_name: phone === TEL_A ? 'Juana' : 'Pedro',
    lead: null,
    property: null,
    // Con la ventana cerrada el compositor viene deshabilitado y no se puede
    // probar nada de lo que pasa al escribir.
    window: { open: ventanaAbierta, msRemaining: ventanaAbierta ? 3600000 : 0 },
    messages: Array.from({ length: cuantos }, (_, i) => ({
      id: `${phone}-${i}`,
      direction: 'in' as const,
      body_preview: `Mensaje ${i}`,
      template_name: null,
      status: 'received',
      error_message: null,
      sent_by: null,
      created_at: new Date(Date.now() - (cuantos - i) * 60000).toISOString(),
      media_url: null,
      media_mime_type: null,
      media_filename: null,
      media_type: null,
    })),
  }
}

const enviados: { url: string; init?: RequestInit }[] = []

function stubFetch(mensajesPorTelefono: Record<string, number> = { [TEL_A]: 4, [TEL_B]: 4 }) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    enviados.push({ url, init })
    const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 })
    if (url.startsWith('/api/whatsapp/conversations?') || url === '/api/whatsapp/conversations') {
      return json({ data: [conversacion(TEL_A, 'Juana'), conversacion(TEL_B, 'Pedro')] })
    }
    if (url.startsWith('/api/whatsapp/conversations/')) {
      const tel = url.split('/api/whatsapp/conversations/')[1].split('?')[0]
      return json({ data: hilo(tel, mensajesPorTelefono[tel] ?? 4) })
    }
    if (url === '/api/leads/tags') return json({ data: [] })
    if (url === '/api/whatsapp/send') return json({ ok: true })
    return json({ data: [] })
  })
}

/** Ancho de pantalla, que es lo que lee `useIsMobile()`. */
function ponerAncho(px: number) {
  Object.defineProperty(window, 'innerWidth', { value: px, configurable: true, writable: true })
}

const pantalla = () => <InboxTabs userRole="admin" userId="u1" />

beforeEach(() => {
  busqueda = 'tab=whatsapp'
  ventanaAbierta = true
  enviados.length = 0
  pushState.mockClear()
  replaceState.mockClear()
  back.mockClear()
  vi.stubGlobal('fetch', stubFetch())
  window.history.pushState = pushState as unknown as typeof window.history.pushState
  window.history.replaceState = replaceState as unknown as typeof window.history.replaceState
  window.history.back = back
  // `scrollIntoView` no existe en happy-dom; lo usa la bajada explícita del
  // compositor (enfocar el campo, mandar un mensaje). El que manda el hilo al
  // final ahora es `scrollTo` sobre el propio scroller del hilo, así que
  // también se espía.
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.scrollTo = vi.fn()
  ponerAncho(1280)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('la conversación abierta vive en la URL', () => {
  it('tocar una conversación empuja `?tab=whatsapp&chat=<teléfono>` al historial', async () => {
    render(pantalla())
    const fila = await screen.findByText('Juana')
    fireEvent.click(fila)

    expect(pushState).toHaveBeenCalledTimes(1)
    expect(pushState.mock.calls[0][2]).toBe(`/inbox?tab=whatsapp&chat=${TEL_A}`)
  })

  it('con `chat=` en la URL se ve el hilo, con su botón de volver rotulado', async () => {
    busqueda = `tab=whatsapp&chat=${TEL_A}`
    render(pantalla())

    // El botón es solo una flecha: sin `aria-label` no existe para nadie que no
    // lo esté mirando.
    expect(await screen.findByRole('button', { name: 'Volver a la lista de chats' })).toBeInTheDocument()
    expect(await screen.findByText('Mensaje 3')).toBeInTheDocument()
  })

  it('sobrevive al refresco: la conversación se abre sola desde la URL', async () => {
    busqueda = `tab=whatsapp&chat=${TEL_B}`
    render(pantalla())
    await waitFor(() => expect(enviados.some(e => e.url.includes(TEL_B))).toBe(true))
  })

  it('el gesto de volver del teléfono cierra el CHAT y deja el Inbox donde estaba', async () => {
    // Esto es lo que hace que deslizar desde el borde en iOS (y el gesto/botón
    // de atrás en Android) haga lo intuitivo. Abrir el chat empuja UNA entrada
    // de historial; deshacerla devuelve la URL sin `chat=`, y con eso vuelve la
    // lista. Sin la conversación en la URL, ese mismo gesto sacaba al usuario
    // del Inbox entero y se llevaba puestos los filtros que había puesto.
    const { rerender } = render(pantalla())
    fireEvent.click(await screen.findByText('Juana'))
    expect(pushState).toHaveBeenCalledTimes(1) // una sola: un solo "atrás" alcanza

    await act(async () => {
      rerender(pantalla())
    })
    await screen.findByText('Mensaje 3')

    // El navegador deshace esa entrada: la URL vuelve a la de la lista.
    busqueda = 'tab=whatsapp'
    await act(async () => {
      rerender(pantalla())
    })

    expect(screen.queryByText('Mensaje 3')).toBeNull()
    expect(screen.getByText('Juana')).toBeInTheDocument()
    expect(screen.getByText('Pedro')).toBeInTheDocument()
    // Y el buscador de la lista vuelve a estar: no se salió del Inbox.
    expect(screen.getByLabelText('Buscar conversaciones')).toBeInTheDocument()
  })
})

describe('el buscador está siempre a mano', () => {
  it('no vive adentro del scroller de la lista: no hay que subir hasta arriba para buscar', async () => {
    // Si el buscador scrollea con las conversaciones, buscar a la altura del
    // chat número cuarenta obliga a un arrastre largo hasta el tope. Queda fuera
    // del scroller a propósito.
    const { container } = render(pantalla())
    const buscador = await screen.findByLabelText('Buscar conversaciones')
    const scroller = container.querySelector('[data-slot="lista-scroller"]')
    expect(scroller).not.toBeNull()
    expect(scroller!.contains(buscador)).toBe(false)
  })

  it('con el chat abierto no se ve (ahí no sirve, y son píxeles de conversación)', async () => {
    busqueda = `tab=whatsapp&chat=${TEL_A}`
    render(pantalla())
    await screen.findByText('Mensaje 3')
    const franja = screen.getByLabelText('Buscar conversaciones').closest('.border-b') as HTMLElement
    // La franja entera se esconde en celular; en `md:` sigue estando.
    expect(franja.parentElement!.className).toContain('hidden')
    expect(franja.parentElement!.className).toContain('md:block')
  })
})

describe('entrar al chat se nota (y se puede apagar)', () => {
  it('el hilo entra con la transición corta, solo mientras está abierto', async () => {
    busqueda = `tab=whatsapp&chat=${TEL_A}`
    const { container, rerender } = render(pantalla())
    await screen.findByText('Mensaje 3')
    expect(container.innerHTML).toContain('entrada-chat')

    // Cerrado, la clase no está: así la animación corre al ABRIR y nunca al
    // cerrar, que es lo que la vuelve una pista de dirección y no un parpadeo.
    busqueda = 'tab=whatsapp'
    await act(async () => {
      rerender(pantalla())
    })
    expect(container.innerHTML).not.toContain('entrada-chat')
  })
})

describe('el botón de volver hace lo mismo que el gesto del teléfono', () => {
  it('si el chat se abrió desde la lista, cerrarlo deshace ESA entrada de historial', async () => {
    const { rerender } = render(pantalla())
    fireEvent.click(await screen.findByText('Juana'))

    // Next sincroniza la URL; acá se simula volviendo a renderizar.
    await act(async () => {
      rerender(pantalla())
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Volver a la lista de chats' }))
    expect(back).toHaveBeenCalledTimes(1)
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('si se entró directo por URL, NO se va para atrás (eso sacaría al usuario de la app)', async () => {
    busqueda = `tab=whatsapp&chat=${TEL_A}`
    render(pantalla())

    fireEvent.click(await screen.findByRole('button', { name: 'Volver a la lista de chats' }))
    expect(back).not.toHaveBeenCalled()
    expect(replaceState).toHaveBeenCalledTimes(1)
    expect(replaceState.mock.calls[0][2]).toBe('/inbox?tab=whatsapp')
  })
})

describe('el compositor en un teléfono', () => {
  async function abrirCompositor(anchoPx: number) {
    ponerAncho(anchoPx)
    busqueda = `tab=whatsapp&chat=${TEL_A}`
    render(pantalla())
    return (await screen.findByPlaceholderText('Escribí tu respuesta…')) as HTMLTextAreaElement
  }

  it('en el teléfono, Enter NO manda el mensaje: hace salto de línea', async () => {
    const campo = await abrirCompositor(390)
    fireEvent.change(campo, { target: { value: 'Hola, ¿cómo va?' } })
    fireEvent.keyDown(campo, { key: 'Enter', shiftKey: false })

    await waitFor(() => expect(enviados.some(e => e.url === '/api/whatsapp/conversations')).toBe(true))
    expect(enviados.some(e => e.url === '/api/whatsapp/send')).toBe(false)
  })

  it('en escritorio, Enter sigue mandando (el atajo no se pierde)', async () => {
    const campo = await abrirCompositor(1280)
    fireEvent.change(campo, { target: { value: 'Hola, ¿cómo va?' } })
    fireEvent.keyDown(campo, { key: 'Enter', shiftKey: false })

    await waitFor(() => expect(enviados.some(e => e.url === '/api/whatsapp/send')).toBe(true))
  })

  it('al mandar un mensaje, el hilo baja al final aunque se estuviera leyendo para arriba', async () => {
    // El asesor acaba de escribir: lo que quiere ver es su propio mensaje
    // saliendo, no el punto de la conversación donde estaba leyendo. Es la única
    // bajada que ignora a propósito dónde está el scroll.
    const campo = await abrirCompositor(390)
    const scrollIntoView = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>
    fireEvent.change(campo, { target: { value: 'Voy para allá' } })
    scrollIntoView.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Enviar el mensaje' }))

    await waitFor(() => expect(enviados.some(e => e.url === '/api/whatsapp/send')).toBe(true))
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
  })

  it('el compositor respeta la barra de gestos del iPhone y no lo aplasta el flex', async () => {
    // Desde que el viewport es `viewport-fit=cover`, sin `pb-safe` el botón de
    // enviar queda DEBAJO de la barra de gestos. Y sin `shrink-0`, el flex
    // aplasta el compositor antes de dejar que scrollee el hilo.
    const campo = await abrirCompositor(390)
    const caja = campo.closest('div')?.parentElement
    expect(caja?.className).toContain('pb-safe')
    expect(caja?.className).toContain('shrink-0')
  })

  it('al enfocar el campo, el hilo muestra el final (el teclado le acaba de robar la mitad)', async () => {
    const campo = await abrirCompositor(390)
    const scrollIntoView = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>
    scrollIntoView.mockClear()
    fireEvent.focus(campo)
    expect(scrollIntoView).toHaveBeenCalled()
  })

  it('el botón de enviar está rotulado (es solo un ícono)', async () => {
    await abrirCompositor(390)
    expect(screen.getByRole('button', { name: 'Enviar el mensaje' })).toBeInTheDocument()
  })

  it('el campo crece con lo que se escribe, hasta un techo de 5 renglones', async () => {
    const campo = await abrirCompositor(390)
    // happy-dom no maquetea, así que `scrollHeight` se simula: lo que se prueba
    // es que el alto se escriba a partir de él y que el techo se respete.
    Object.defineProperty(campo, 'scrollHeight', { value: 72, configurable: true })
    fireEvent.change(campo, { target: { value: 'dos\nrenglones' } })
    expect(campo.style.height).toBe('72px')

    Object.defineProperty(campo, 'scrollHeight', { value: 400, configurable: true })
    fireEvent.change(campo, { target: { value: 'un texto larguísimo' } })
    expect(campo.style.height).toBe('128px')
  })
})

describe('el aviso de la ventana de 24hs cerrada', () => {
  async function abrirConVentanaCerrada() {
    ventanaAbierta = false
    busqueda = `tab=whatsapp&chat=${TEL_A}`
    render(pantalla())
    return await screen.findByText(/Pasaron 24hs/)
  }

  it('entra en una línea y no en cinco', async () => {
    // Las dos oraciones completas de antes eran ~75px fijos a 11px de tipografía,
    // sobre un hilo que en un teléfono estaba en 50px: más párrafo explicativo
    // que conversación.
    const aviso = (await abrirConVentanaCerrada()).closest('p')
    const visible = [...(aviso?.childNodes ?? [])]
      .filter(n => !(n instanceof HTMLElement) || !n.className.includes('sr-only'))
      .map(n => n.textContent ?? '')
      .join('')
      .trim()
    expect(visible.length, `el aviso visible sigue siendo largo: "${visible}"`).toBeLessThan(70)
  })

  it('la explicación completa no se pierde: queda para lectores de pantalla', async () => {
    const aviso = (await abrirConVentanaCerrada()).closest('p')
    expect(aviso?.textContent).toContain('plantilla aprobada')
    expect(aviso?.querySelector('.sr-only')?.textContent).toContain('WhatsApp no deja mandarle texto libre')
  })

  it('"una plantilla aprobada" es el botón que abre el selector de plantillas', async () => {
    await abrirConVentanaCerrada()
    fireEvent.click(screen.getByRole('button', { name: 'una plantilla aprobada' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})

describe('al abrir una conversación, el hilo muestra el final', () => {
  it('cambiar a otra conversación con la MISMA cantidad de mensajes igual baja al final', async () => {
    // El defecto original: el efecto dependía solo de `messages.length`. Con dos
    // hilos de 4 mensajes, no volvía a correr y el chat nuevo se abría arriba de
    // todo, mostrando el mensaje MÁS VIEJO.
    //
    // Hoy lo garantiza el `key` por teléfono: cada conversación monta su propio
    // `ChatThread`, y uno recién montado SIEMPRE arranca en el final. Por eso lo
    // que se mira es `scrollTo` sobre el scroller del hilo y no el
    // `scrollIntoView` de antes — el mecanismo cambió, la promesa es la misma.
    busqueda = `tab=whatsapp&chat=${TEL_A}`
    const { rerender } = render(pantalla())
    await screen.findByText('Mensaje 3')

    const scrollTo = Element.prototype.scrollTo as ReturnType<typeof vi.fn>
    scrollTo.mockClear()

    busqueda = `tab=whatsapp&chat=${TEL_B}`
    await act(async () => {
      rerender(pantalla())
    })

    await waitFor(() => expect(scrollTo).toHaveBeenCalled())
    // Y al FINAL, no a cualquier lado: `top` es el alto total del contenido.
    const args = scrollTo.mock.calls.at(-1)?.[0] as { top: number; behavior: string }
    expect(args.behavior).toBe('auto')
    expect(args.top).toBe(0) // happy-dom no calcula layout: `scrollHeight` es 0
  })

  it('abrir una conversación monta un hilo NUEVO (por eso arranca en el final)', async () => {
    // Fija el mecanismo, que es lo que hace innecesario acordarse de resetear a
    // mano la posición del scroll y el contador de mensajes nuevos: si alguien
    // saca el `key`, el hilo pasa a reutilizarse entre conversaciones y este
    // test se pone en rojo antes de que el defecto vuelva a la pantalla.
    busqueda = `tab=whatsapp&chat=${TEL_A}`
    const { rerender, container } = render(pantalla())
    await screen.findByText('Mensaje 3')
    const primerScroller = container.querySelector('[data-slot="hilo-scroller"]')

    busqueda = `tab=whatsapp&chat=${TEL_B}`
    await act(async () => {
      rerender(pantalla())
    })
    await screen.findByText('Mensaje 3')

    expect(container.querySelector('[data-slot="hilo-scroller"]')).not.toBe(primerScroller)
  })
})
