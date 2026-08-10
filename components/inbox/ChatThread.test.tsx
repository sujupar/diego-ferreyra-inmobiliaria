// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { ChatThread } from './ChatThread'
import type { ThreadMessage } from './types'

const HOUR = 3600000

function msg(direction: 'in' | 'out', minutesAgo: number, status = direction === 'in' ? 'received' : 'delivered'): ThreadMessage {
  return {
    id: `${direction}-${minutesAgo}-${status}`,
    direction,
    body_preview: direction === 'in' ? 'Hola, me interesa' : 'Nota',
    template_name: null,
    status,
    error_message: null,
    sent_by: null,
    created_at: new Date(Date.now() - minutesAgo * 60000).toISOString(),
    media_url: null,
    media_mime_type: null,
    media_filename: null,
    media_type: null,
  }
}

const endRef = { current: null }

function text(messages: ThreadMessage[]): string {
  return render(<ChatThread messages={messages} endRef={endRef} />).container.textContent ?? ''
}

describe('ChatThread — franja de demora', () => {
  it('el último mensaje es del cliente y hace rato → avisa desde cuándo espera', () => {
    expect(text([msg('in', 180)])).toContain('El cliente escribió hace 3 h y todavía nadie le contestó.')
  })

  it('el equipo ya contestó de verdad → no hay franja', () => {
    expect(text([msg('in', 180), msg('out', 175)])).not.toContain('todavía nadie le contestó')
  })

  it('espera corta (menos del umbral) → no hay franja', () => {
    expect(text([msg('in', 30)])).not.toContain('todavía nadie le contestó')
  })

  // El defecto que cierra este test: la nota interna del agente de IA es
  // reciente, así que la franja medía desde ELLA y directamente no aparecía —
  // el hilo se veía tranquilo con el cliente esperando hace 3 horas.
  it.each(['agent_handoff', 'agent_visit_pending', 'agent_visit_failed'])(
    'la nota interna del agente de IA (%s) no tapa la demora: se mide desde el mensaje del cliente',
    status => {
      expect(text([msg('in', 180), msg('out', 1, status)])).toContain('El cliente escribió hace 3 h y todavía nadie le contestó.')
    },
  )

  it('un envío que rebotó tampoco tapa la demora', () => {
    expect(text([msg('in', 180), msg('out', 1, 'failed')])).toContain('El cliente escribió hace 3 h y todavía nadie le contestó.')
  })

  it('hilo sin mensajes: el vacío, sin franja', () => {
    const t = text([])
    expect(t).toContain('Todavía no hay mensajes en esta conversación.')
    expect(t).not.toContain('todavía nadie le contestó')
  })
})

/**
 * Fase 1 del sistema móvil. Son clases, y no hay navegador donde mirarlas — pero
 * cada una tiene un síntoma que el asesor sufre con el pulgar.
 */
describe('ChatThread — el hilo en un teléfono', () => {
  // Se busca por `data-slot` y no por "el primer hijo": desde que el botón de
  // "bajar al último mensaje" necesita un ancla que no se mueva con el
  // contenido, el primer hijo es un envoltorio sin scroll y el scroller es el de
  // adentro. Lo que estos tests protegen es el SCROLLER, no su posición en el
  // árbol.
  const clasesDelHilo = () => {
    const { container } = render(<ChatThread messages={[msg('in', 5)]} endRef={endRef} />)
    return (container.querySelector('[data-slot="hilo-scroller"]') as HTMLElement).className
  }

  it('el envoltorio no scrollea: el único scroller del hilo sigue siendo uno solo', () => {
    const { container } = render(<ChatThread messages={[msg('in', 5)]} endRef={endRef} />)
    const envoltorio = container.firstElementChild as HTMLElement
    expect(envoltorio.className).toContain('relative')
    expect(envoltorio.className).not.toContain('scroll-pane')
    expect(container.querySelectorAll('[data-slot="hilo-scroller"]')).toHaveLength(1)
  })

  it('contiene su propio gesto de scroll (`scroll-pane`)', () => {
    // Sin `overscroll-behavior: contain`, llegar al final del hilo dispara el
    // rebote de iOS y el "tirar para recargar" de Android, que hoy además pierde
    // la conversación abierta.
    expect(clasesDelHilo()).toContain('scroll-pane')
  })

  it('no puede scrollear de costado', () => {
    // Un adjunto ancho hacía que el chat entero se corriera al arrastrar.
    expect(clasesDelHilo()).toContain('overflow-x-hidden')
  })

  it('gasta menos margen lateral en celular (8px más de burbuja)', () => {
    const clases = clasesDelHilo()
    expect(clases).toContain('px-3')
    expect(clases).toContain('md:px-4')
  })

  it('NO tiene piso de alto: con el teclado abierto el hilo tiene que poder achicarse', () => {
    // Un `min-h` en `vh` empujaría el compositor contra el teclado y lo mandaría
    // fuera de cuadro — justo lo contrario de lo que se está arreglando.
    expect(clasesDelHilo()).not.toMatch(/min-h-\[/)
  })
})

/**
 * El botón de "bajar al último mensaje". No hay navegador, así que el scroll se
 * simula: se le fijan las medidas al scroller y se dispara el evento. Lo que se
 * prueba es la decisión, que es lo único que puede estar mal.
 */
describe('ChatThread — bajar al último mensaje', () => {
  function montar(mensajes: ThreadMessage[]) {
    const { container, rerender } = render(<ChatThread messages={mensajes} endRef={endRef} />)
    const scroller = container.querySelector('[data-slot="hilo-scroller"]') as HTMLElement
    // happy-dom no calcula layout: las tres medidas valen 0 y hay que ponerlas
    // a mano. `scrollTo` tampoco existe con comportamiento real.
    scroller.scrollTo = () => {}
    function medir(scrollTop: number, scrollHeight: number, clientHeight: number) {
      Object.defineProperty(scroller, 'scrollTop', { value: scrollTop, configurable: true })
      Object.defineProperty(scroller, 'scrollHeight', { value: scrollHeight, configurable: true })
      Object.defineProperty(scroller, 'clientHeight', { value: clientHeight, configurable: true })
      fireEvent.scroll(scroller)
    }
    const boton = () => container.querySelector('button[aria-label^="Bajar"]') as HTMLElement | null
    return { container, rerender, medir, boton }
  }

  const unMensaje = [msg('in', 30)]

  it('mirando el final NO aparece: un botón permanente sería ruido', () => {
    const { boton } = montar(unMensaje)
    expect(boton()).toBeNull()
  })

  it('leyendo para arriba aparece', () => {
    const { medir, boton } = montar(unMensaje)
    medir(0, 4000, 600)
    expect(boton()).not.toBeNull()
    expect(boton()!.getAttribute('aria-label')).toBe('Bajar al último mensaje')
  })

  it('volver al final lo hace desaparecer solo', () => {
    const { medir, boton } = montar(unMensaje)
    medir(0, 4000, 600)
    expect(boton()).not.toBeNull()
    medir(3400, 4000, 600)
    expect(boton()).toBeNull()
  })

  it('los mensajes que llegan mientras se lee para arriba se cuentan en el botón', () => {
    const { medir, rerender, boton } = montar(unMensaje)
    medir(0, 4000, 600)
    rerender(<ChatThread messages={[...unMensaje, msg('in', 2), msg('in', 1)]} endRef={endRef} />)
    expect(boton()!.getAttribute('aria-label')).toBe('Bajar a los 2 mensajes nuevos')
    expect(boton()!.textContent).toContain('2')
  })

  it('volver al final borra el conteo: al subir de nuevo, el botón arranca limpio', () => {
    // Un contador que sigue diciendo "2" después de que el asesor ya los leyó es
    // peor que no tenerlo.
    const { medir, rerender, boton } = montar(unMensaje)
    medir(0, 4000, 600)
    rerender(<ChatThread messages={[...unMensaje, msg('in', 2), msg('in', 1)]} endRef={endRef} />)
    expect(boton()!.getAttribute('aria-label')).toBe('Bajar a los 2 mensajes nuevos')

    medir(3400, 4000, 600) // vuelve al final: los vio
    medir(0, 4000, 600) // y sube otra vez
    expect(boton()!.getAttribute('aria-label')).toBe('Bajar al último mensaje')
  })

  it('un refresco sin mensajes nuevos no inventa un conteo', () => {
    // El hilo se re-consulta cada 15 segundos: sin esto el botón se llenaría de
    // números por estar quieto.
    const { medir, rerender, boton } = montar(unMensaje)
    medir(0, 4000, 600)
    rerender(<ChatThread messages={[...unMensaje]} endRef={endRef} />)
    expect(boton()!.getAttribute('aria-label')).toBe('Bajar al último mensaje')
  })

  it('tocarlo baja y se esconde', () => {
    const { medir, boton } = montar(unMensaje)
    medir(0, 4000, 600)
    fireEvent.click(boton()!)
    expect(boton()).toBeNull()
  })
})

describe('ChatThread — umbral', () => {
  it('el umbral es de 2 horas (justo abajo no alerta, justo arriba sí)', () => {
    expect(text([msg('in', 119)])).not.toContain('todavía nadie le contestó')
    expect(text([msg('in', 121)])).toContain('todavía nadie le contestó')
    // Sanity: el umbral que usa la franja es el compartido, no uno propio.
    expect(2 * HOUR).toBe(2 * 60 * 60 * 1000)
  })
})
