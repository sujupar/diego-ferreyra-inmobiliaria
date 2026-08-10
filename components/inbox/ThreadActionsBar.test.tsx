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
import { render, screen } from '@testing-library/react'
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
