// @vitest-environment happy-dom
/**
 * El botón "Agente activo / Agente apagado" del hilo.
 *
 * Estuvo roto desde que nació: el endpoint de la lista calculaba el flag y no
 * lo emitía, así que `agentOff` llegaba `undefined`, el botón decía "Agente
 * activo" pase lo que pase y —como el body es `{activo: agentOff === true}`—
 * mandaba SIEMPRE `activo:false`. O sea: una vez apagado no había forma de
 * volver a prenderlo desde la pantalla, solo por SQL.
 *
 * Estos tests fijan las dos mitades del contrato acá, del lado del consumidor:
 * lo que se ROTULA y lo que se MANDA. La otra mitad (que el endpoint emita
 * `agent_off`) está en `app/api/whatsapp/conversations/route.test.ts`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThreadActionsBar } from './ThreadActionsBar'

const PHONE = '5491122334455'

function renderBarra(agentOff: boolean | undefined) {
  return render(
    <ThreadActionsBar
      property={null}
      onOpenPropertyInfo={() => {}}
      onOpenTemplatePicker={() => {}}
      lead={null}
      tags={[]}
      tagCatalog={[]}
      pipelineState={null}
      onTagsChanged={() => {}}
      onStateChanged={() => {}}
      phoneE164={PHONE}
      agentOff={agentOff}
      onAgentToggled={() => {}}
    />,
  )
}

/** La barra con un lead resuelto, que es cuando Etiquetas y Estado se pueden usar. */
function renderBarraConLead() {
  return render(
    <ThreadActionsBar
      property={{ id: 'p1', address: 'Av. Siempreviva 742', title: null, cover_photo: null }}
      onOpenPropertyInfo={() => {}}
      onOpenTemplatePicker={() => {}}
      lead={{ id: 'l1', name: 'Juana', lead_number: 12 }}
      tags={[]}
      tagCatalog={[{ slug: 'caliente', label: 'Caliente', color: 'red' }]}
      pipelineState="negotiating"
      onTagsChanged={() => {}}
      onStateChanged={() => {}}
      phoneE164={PHONE}
      agentOff={false}
      onAgentToggled={() => {}}
    />,
  )
}

/** El botón del agente es el único que menciona la palabra "Agente". */
function botonAgente(): HTMLButtonElement {
  return screen.getByRole('button', { name: /Agente/ }) as HTMLButtonElement
}

describe('ThreadActionsBar — botón del agente de IA', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('con el agente apagado, lo dice', () => {
    renderBarra(true)
    expect(botonAgente().textContent).toContain('Agente apagado')
  })

  it('con el agente encendido, lo dice', () => {
    renderBarra(false)
    expect(botonAgente().textContent).toContain('Agente activo')
  })

  it('si el endpoint todavía no manda el flag, asume activo (no inventa "apagado")', () => {
    renderBarra(undefined)
    expect(botonAgente().textContent).toContain('Agente activo')
  })

  it('estando APAGADO, el botón pide PRENDERLO (activo:true) — la puerta abre para los dos lados', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, activo: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    renderBarra(true)
    botonAgente().click()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`/api/whatsapp/conversations/${PHONE}/agent`)
    expect(JSON.parse(String(init.body))).toEqual({ activo: true })
  })

  it('estando ACTIVO, el botón pide apagarlo (activo:false)', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, activo: false }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    renderBarra(false)
    botonAgente().click()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ activo: false })
  })
})

/**
 * Fase 1 del sistema móvil. En un teléfono estos cinco botones suman ~527px de
 * ancho mínimo dentro de una tarjeta de ~356px con `overflow-hidden`: quedaban
 * literalmente recortados y sin forma de alcanzarlos (no hay scroll horizontal
 * porque está clipeado). Cambiar el estado del embudo desde el celular era
 * imposible. Ahora las mismas cinco acciones viven detrás de un botón de tres
 * puntos, con el MISMO estado y los MISMOS handlers — no una copia.
 */
describe('ThreadActionsBar — las acciones en un teléfono', () => {
  it('hay un menú de tres puntos, rotulado (es solo un ícono)', () => {
    renderBarraConLead()
    expect(screen.getByRole('button', { name: 'Más acciones de la conversación' })).toBeTruthy()
  })

  it('la fila completa de botones NO se dibuja en celular', () => {
    const { container } = renderBarraConLead()
    const fila = container.querySelector('.flex.flex-wrap')
    expect(fila?.className).toContain('max-md:hidden')
  })

  it('el menú se ve solo en celular: en escritorio manda la fila de siempre', () => {
    renderBarraConLead()
    const envoltorio = screen.getByRole('button', { name: 'Más acciones de la conversación' }).parentElement
    expect(envoltorio?.className).toContain('md:hidden')
  })

  it('el menú trae las CINCO acciones, incluidas las dos que quedaban recortadas', async () => {
    renderBarraConLead()
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Más acciones de la conversación' }),
      { ctrlKey: false, button: 0 },
    )
    await vi.waitFor(() => expect(screen.getByRole('menu')).toBeTruthy())
    const texto = screen.getByRole('menu').textContent ?? ''
    for (const accion of ['propiedad', 'plantilla', 'Etiquetas', 'Estado', 'agente']) {
      expect(texto, `falta "${accion}" en el menú`).toContain(accion)
    }
  })
})
