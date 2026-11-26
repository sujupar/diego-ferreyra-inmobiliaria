// @vitest-environment happy-dom
// El aviso después de guardar, una prueba por variante (tarea 9.6).
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { armarAviso, type EntradaAviso } from '@/lib/crm/aviso-guardado'
import type { BloqueCadencia } from '@/lib/supabase/cadencia'
import { AvisoGuardado } from './AvisoGuardado'
import { FichaContacto } from './FichaContacto'
import { CONTACTO, actividadDePrueba, fichaDePrueba, pedidosA, simularRed, tareaDePrueba } from './datos-prueba'

vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(() => 'id'), { error: vi.fn(() => 'e'), dismiss: vi.fn() }) }))
afterEach(() => vi.unstubAllGlobals())

const ahora = new Date('2026-11-25T13:00:00Z')
const cad = (c: Partial<BloqueCadencia> = {}): BloqueCadencia => ({
  aplica: true,
  tareaCreada: null,
  motivoSinTarea: null,
  tareasCerradas: [],
  ofrecer: null,
  dealId: 'd-1',
  ...c,
})
const entrada = (e: Partial<EntradaAviso> = {}): EntradaAviso => ({
  tipo: 'call',
  titulo: 'Llamada 1 · No atendió',
  intento: 1,
  resultado: 'no_atendio',
  cadencia: cad(),
  pendiente: false,
  contactoId: CONTACTO,
  nombreContacto: 'María López',
  etiquetaEtapa: 'Coordinada',
  ahora,
  ...e,
})
function dibujar(e: Partial<EntradaAviso> = {}) {
  const onAccion = vi.fn()
  const onCerrar = vi.fn()
  render(<AvisoGuardado aviso={armarAviso(entrada(e))} onAccion={onAccion} onCerrar={onCerrar} />)
  return { onAccion, onCerrar, aviso: screen.getByRole('status') }
}
const botones = (el: HTMLElement) =>
  [...el.querySelectorAll('a, button')].map((b) => b.textContent?.trim()).filter((t) => t && t !== '')

describe('AvisoGuardado: variantes', () => {
  it('tarea agendada para mañana, con "Ver en Tareas" solo en la vista de una columna', () => {
    const { aviso } = dibujar({
      cadencia: cad({ tareaCreada: { id: 't', title: 'Llamada 2 a María López', due_date: '2026-11-26', due_time: '09:00:00', channel: 'call' } }),
    })
    expect(aviso).toHaveTextContent('Llamada 1 · No atendió')
    expect(aviso).toHaveTextContent('Se agendó Llamada 2 para mañana 9:00.')
    expect(within(aviso).getByRole('button', { name: 'Ver en Tareas' })).toHaveClass('ficha-solo-pestanas')
  })
  it('tarea agendada para otro día: "lun 30 nov, 9:00"', () => {
    const { aviso } = dibujar({
      ahora: new Date('2026-11-27T13:00:00Z'),
      cadencia: cad({ tareaCreada: { id: 't', title: 'Llamada 2 a María López', due_date: '2026-11-30', due_time: '09:00', channel: 'call' } }),
    })
    expect(aviso).toHaveTextContent('Se agendó Llamada 2 para lun 30 nov, 9:00.')
  })
  it('tareas cerradas: una línea por cada una', () => {
    const { aviso } = dibujar({
      resultado: 'agendo',
      cadencia: cad({ motivoSinTarea: 'no_corresponde', tareasCerradas: [{ id: '1', title: 'Llamar a María López' }, { id: '2', title: 'Enviar WhatsApp a María López' }] }),
    })
    expect(aviso).toHaveTextContent('Se completó sola la tarea «Llamar a María López».')
    expect(aviso).toHaveTextContent('Se completó sola la tarea «Enviar WhatsApp a María López».')
  })
  it('WhatsApp marcado', () => {
    const { aviso } = dibujar({ tipo: 'whatsapp_sent', resultado: null, intento: null, cadencia: cad({ motivoSinTarea: 'secuencia_terminada' }) })
    expect(aviso).toHaveTextContent('WhatsApp marcado como enviado')
    expect(aviso).toHaveTextContent('La secuencia termina acá: no se crea ninguna tarea más.')
    expect(aviso).toHaveTextContent('Si no contesta y querés seguirla, agendá una con «+ Tarea».')
  })
  it('intento fuera de orden', () => {
    const { aviso } = dibujar({ cadencia: cad({ aplica: false, motivoSinTarea: 'fuera_de_orden' }) })
    expect(aviso).toHaveTextContent('Quedó anotada antes de otra más nueva: no se agenda ni se cierra ninguna tarea.')
    expect(aviso).not.toHaveTextContent('Se agendó')
  })
  it('fuera de orden con "volver a llamar": suma "Si hace falta, agendala con «+ Tarea»." y no agenda nada', () => {
    const { aviso } = dibujar({ resultado: 'volver_a_llamar', cadencia: cad({ aplica: false, motivoSinTarea: 'fuera_de_orden' }) })
    expect(aviso).toHaveTextContent('Quedó anotada antes de otra más nueva: no se agenda ni se cierra ninguna tarea. Si hace falta, agendala con «+ Tarea».')
    expect(aviso).not.toHaveTextContent('Se agendó')
  })
  it('sin proceso', () => {
    const { aviso } = dibujar({ cadencia: cad({ motivoSinTarea: 'sin_proceso', dealId: null }) })
    expect(aviso).toHaveTextContent('No tiene un proceso abierto: no se agenda la llamada siguiente.')
  })
  it('proceso ajeno, y con su propia "Llamar a…" cerrada en otro renglón', () => {
    const { aviso } = dibujar({ cadencia: cad({ motivoSinTarea: 'proceso_ajeno', tareasCerradas: [{ id: 'x', title: 'Llamar a María López' }] }) })
    const lineas = [...aviso.querySelectorAll('p')].map((p) => p.textContent)
    expect(lineas).toContain(
      'Quedó anotada. Este proceso lo lleva otra persona: no se agenda la siguiente ni se cierran las tareas de esa persona.',
    )
    expect(lineas).toContain('Se completó sola la tarea «Llamar a María López».')
  })
  it('pendiente: "Reintentar" avisa la acción', async () => {
    const { aviso, onAccion } = dibujar({ pendiente: true })
    expect(aviso).toHaveAttribute('data-aviso', 'pendiente')
    expect(aviso).toHaveTextContent('La llamada quedó guardada, pero no se pudo agendar la siguiente.')
    await userEvent.setup().click(within(aviso).getByRole('button', { name: 'Reintentar' }))
    expect(onAccion).toHaveBeenCalledWith({ tipo: 'reintentar', etiqueta: 'Reintentar' })
  })
  it('la X lo cierra', async () => {
    const { aviso, onCerrar } = dibujar()
    await userEvent.setup().click(within(aviso).getByRole('button', { name: 'Cerrar el aviso' }))
    expect(onCerrar).toHaveBeenCalled()
  })
})

describe('AvisoGuardado: las ocho filas de "ofrecer"', () => {
  const ofrecer = (o: BloqueCadencia['ofrecer'], resultado: EntradaAviso['resultado'] = 'agendo') =>
    dibujar({ resultado, titulo: 'Llamada 1 · Agendó', cadencia: cad({ motivoSinTarea: 'no_corresponde', ofrecer: o }) }).aviso

  it('coordinar_solicitud: "Coordinar tasación" a /pipeline/new?deal=', () => {
    const a = ofrecer('coordinar_solicitud')
    expect(a).toHaveTextContent('Falta coordinar día, hora y asesor de la tasación.')
    expect(within(a).getByRole('link', { name: 'Coordinar tasación' })).toHaveAttribute('href', '/pipeline/new?deal=d-1')
  })
  it('coordinar_nuevo: a /pipeline/new?contact=', () => {
    const a = ofrecer('coordinar_nuevo')
    expect(a).toHaveTextContent('Se abre como un proceso nuevo.')
    expect(within(a).getByRole('link', { name: 'Coordinar tasación' })).toHaveAttribute('href', `/pipeline/new?contact=${CONTACTO}`)
  })
  it('abrir_proceso: "Abrir el proceso"', () => {
    const a = ofrecer('abrir_proceso')
    expect(a).toHaveTextContent('El proceso ya está en Coordinada: no hace falta coordinar de nuevo.')
    expect(within(a).getByRole('link', { name: 'Abrir el proceso' })).toHaveAttribute('href', '/pipeline/d-1')
  })
  it('proceso_ya_coordinado: el texto sin ningún botón ni enlace (solo la X)', () => {
    const a = ofrecer('proceso_ya_coordinado')
    expect(a).toHaveTextContent('El proceso ya está en Coordinada: no hace falta coordinar de nuevo.')
    expect(within(a).queryAllByRole('link')).toHaveLength(0)
    expect(within(a).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Cerrar el aviso'])
  })
  it('pedir_coordinacion: sin botones', () => {
    const a = ofrecer('pedir_coordinacion')
    expect(a).toHaveTextContent('Falta coordinar día, hora y asesor de la tasación. Pedíselo a la coordinación.')
    expect(botones(a)).toEqual([])
  })
  it('cerrar_proceso: "Marcar proceso como perdido" y "Dejarlo abierto"', () => {
    const a = ofrecer('cerrar_proceso', 'no_interesa')
    expect(a).toHaveTextContent('El proceso sigue abierto. Si no hay nada más que hacer, podés cerrarlo.')
    expect(botones(a)).toEqual(['Marcar proceso como perdido', 'Dejarlo abierto'])
  })
  it('pedir_cierre: sin botones', () => {
    const a = ofrecer('pedir_cierre', 'numero_equivocado')
    expect(a).toHaveTextContent('El proceso sigue abierto. Si hay que cerrarlo, avisale a la coordinación.')
    expect(botones(a)).toEqual([])
  })
  it('nada_que_cerrar: sin botones', () => {
    const a = ofrecer('nada_que_cerrar', 'no_interesa')
    expect(a).toHaveTextContent('No tiene ningún proceso abierto: no hay nada que cerrar.')
    expect(botones(a)).toEqual([])
  })
})

describe('Ningún aviso dice «Sin respuesta»', () => {
  it('en todas las variantes dibujadas', () => {
    const motivos = ['whatsapp_ya_enviado', 'whatsapp_ya_pendiente', 'sin_proceso', 'proceso_ajeno', 'secuencia_terminada', 'fuera_de_orden'] as const
    for (const m of motivos) {
      const { unmount } = render(
        <AvisoGuardado aviso={armarAviso(entrada({ cadencia: cad({ motivoSinTarea: m }) }))} onAccion={() => {}} onCerrar={() => {}} />,
      )
      expect(document.body.textContent).not.toContain('Sin respuesta')
      unmount()
    }
  })
})

describe('"Reintentar" en la ficha', () => {
  it('llama a …/cadencia y el aviso pasa a decir lo que agendó', async () => {
    const BASE = `/api/contacts/${CONTACTO}`
    const llamada = actividadDePrueba({ id: 'a-9', kind: 'call', call_outcome: 'no_atendio', body: null, intento: 1, titulo: 'Llamada 1 · No atendió' })
    const red = simularRed({
      [`${BASE}/ficha`]: { body: fichaDePrueba() },
      [`${BASE}/activities`]: { body: { actividades: [], hay_mas: false } },
      [`${BASE}/tasks`]: { body: { tareas: [tareaDePrueba()], total: 1 } },
      [`POST ${BASE}/activities`]: { status: 201, body: { actividad: llamada, cadencia: cad({ dealId: 'd-1' }), pendiente: true } },
      [`POST ${BASE}/activities/a-9/cadencia`]: {
        body: {
          actividad: llamada,
          cadencia: cad({ tareaCreada: { id: 't', title: 'Llamada 2 a [TEST] Marcela Ibáñez', due_date: '2026-11-26', due_time: '09:00', channel: 'call' } }),
          pendiente: false,
        },
      },
    })
    render(<FichaContacto contactoId={CONTACTO} rol="coordinador" usuarioId="u-1" abrirEditor={false} reloj={() => ahora} />)
    const usr = userEvent.setup()
    const composer = await waitFor(() => document.getElementById('ficha-composer') as HTMLElement)
    await screen.findByRole('heading', { name: '[TEST] Marcela Ibáñez' })
    await usr.click(within(composer).getByRole('tab', { name: /Registrar llamada/ }))
    await usr.click(within(composer).getByRole('button', { name: /No atendió/ }))
    const aviso = await screen.findByRole('status')
    expect(aviso).toHaveTextContent('La llamada quedó guardada, pero no se pudo agendar la siguiente.')
    await usr.click(within(aviso).getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Se agendó Llamada 2 para mañana 9:00.'))
    expect(screen.getByRole('status')).not.toHaveTextContent('no se pudo agendar')
    expect(pedidosA(red, '/a-9/cadencia', 'POST')).toHaveLength(1)
  })
})
