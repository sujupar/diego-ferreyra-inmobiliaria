// @vitest-environment happy-dom
// Medidas táctiles (tarea 10.4): todo lo tocable de la ficha lleva 44 px (o más) SIN
// condición, y solo achica con `raton:` (mouse); los campos, 16 px salvo con mouse. happy-dom
// no aplica CSS: se mira la clase. El tamaño real se mide en la vista previa (12.4).
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { armarAviso } from '@/lib/crm/aviso-guardado'
import { Actividad } from './Actividad'
import { AvisoGuardado } from './AvisoGuardado'
import { BloqueLista } from './BloqueLista'
import { BotonMas } from './BotonMas'
import { FichaPestanas } from './FichaPestanas'
import { FormLlamada } from './FormLlamada'
import { FormNota } from './FormNota'
import { actividadDePrueba, fichaDePrueba } from './datos-prueba'

vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}))
afterEach(() => vi.unstubAllGlobals())

const ahora = new Date('2026-11-25T13:00:00Z')
const TACTIL = /(^|\s)(min-h-11|h-11|size-11|min-h-13|size-14)(\s|$)/
const tactil = (el: Element) => expect(el.className, el.textContent ?? '').toMatch(TACTIL)
// Lo que achica tiene que hacerlo SOLO con `raton:` (nunca con `md:`/`sm:`: el ancho no dice si hay dedo).
const sinAchicarPorAncho = (el: Element) => expect(el.className).not.toMatch(/(^|\s)(sm|md|lg):(h|min-h|size)-/)

describe('44 px en todo lo tocable', () => {
  it('pestañas y "+"', () => {
    render(
      <>
        <FichaPestanas activa="actividad" onCambiar={() => {}} numeroTareas={1} />
        <BotonMas onClick={() => {}} />
      </>,
    )
    for (const t of screen.getAllByRole('tab')) tactil(t)
    tactil(screen.getByRole('button', { name: 'Agregar nota o registrar llamada' }))
  })

  it('filtros, menú "⋯" y "Ver más" de la actividad', () => {
    render(
      <Actividad
        bloque={{ estado: 'ok', items: [actividadDePrueba()], hayMas: true, filtro: 'todo', cargandoMas: false, errorMas: null }}
        contactoId="c-1"
        ahora={ahora}
        nuevoId={null}
        onFiltrar={() => {}}
        onReintentar={() => {}}
        onVerMas={() => {}}
        onEditada={() => {}}
        onAnular={async () => true}
        onAbrirLlamada={() => {}}
        onAbrirNota={() => {}}
      />,
    )
    for (const f of ['Todo', 'Llamadas', 'Notas', 'Actividad']) {
      const b = screen.getByRole('button', { name: f })
      tactil(b)
      sinAchicarPorAncho(b)
    }
    tactil(screen.getByRole('button', { name: 'Más acciones' }))
    tactil(screen.getByRole('button', { name: 'Ver más' }))
  })

  it('resultados de la llamada, atajos, "Corregir la hora", campos de 16 px, "Guardar llamada" y "Marcar WhatsApp enviado"', async () => {
    render(<FormLlamada contactoId="c-1" onGuardado={() => {}} reloj={() => ahora} />)
    for (const r of [/No atendió/, /agendó/, /volver a llamar/, /no le interesa/, /equivocado/]) tactil(screen.getByRole('button', { name: r }))
    const usr = userEvent.setup()
    await usr.click(screen.getByRole('button', { name: /volver a llamar/ }))
    for (const a of ['Hoy 16:00', 'Mañana 10:00', 'Mañana 16:00']) tactil(screen.getByRole('button', { name: a }))
    for (const c of [screen.getByLabelText('Día'), screen.getByLabelText('Hora'), screen.getByLabelText(/Comentario/)]) {
      expect(c.className).toMatch(/(^|\s)text-base(\s|$)/)
      expect(c.className).toContain('raton:text-sm')
    }
    tactil(screen.getByRole('button', { name: /Corregir la hora/ }))
    tactil(screen.getByRole('button', { name: 'Guardar llamada' }))
    tactil(screen.getByRole('button', { name: 'Marcar WhatsApp enviado' }))
  })

  it('campo de nota con 16 px y "Guardar nota" de 44 px', () => {
    render(<FormNota contactoId="c-1" onGuardada={() => {}} />)
    expect(screen.getByRole('textbox', { name: 'Nota' }).className).toMatch(/(^|\s)text-base(\s|$)/)
    tactil(screen.getByRole('button', { name: 'Guardar nota' }))
  })

  it('"Coordinar tasación" y "Deshacer" de "Procesos"', () => {
    const base = fichaDePrueba()
    render(
      <BloqueLista
        ficha={{
          ...base,
          procesos: [
            base.procesos[0],
            { ...base.procesos[0], id: 'd-2', etapa: 'descartado', etiquetaEtapa: 'Descartado', puede_convertir: false, deshacer_hasta: new Date(Date.now() + 300_000).toISOString() },
          ],
        }}
        ahora={ahora}
        onDeshacerPerdido={async () => true}
      />,
    )
    tactil(screen.getByRole('link', { name: 'Coordinar tasación' }))
    tactil(screen.getByRole('button', { name: 'Deshacer' }))
  })

  it('cada botón del aviso de una llamada y su X', () => {
    const cad = { aplica: true, tareaCreada: null, motivoSinTarea: 'no_corresponde' as const, tareasCerradas: [], dealId: 'd-1' }
    const base = { tipo: 'call' as const, titulo: 'Llamada 1 · Agendó', intento: 1, contactoId: 'c-1', nombreContacto: 'X', etiquetaEtapa: 'Coordinada', ahora }
    const avisos = [
      armarAviso({ ...base, resultado: 'agendo', pendiente: false, cadencia: { ...cad, ofrecer: 'coordinar_solicitud' } }),
      armarAviso({ ...base, resultado: 'agendo', pendiente: false, cadencia: { ...cad, ofrecer: 'abrir_proceso' } }),
      armarAviso({ ...base, resultado: 'no_interesa', pendiente: false, cadencia: { ...cad, ofrecer: 'cerrar_proceso' } }),
      armarAviso({
        ...base,
        resultado: 'no_atendio',
        pendiente: true,
        cadencia: { ...cad, motivoSinTarea: null, ofrecer: null, tareaCreada: { id: 't', title: 'Llamada 2 a X', due_date: '2026-11-26', due_time: '09:00', channel: 'call' } },
      }),
    ]
    for (const a of avisos) {
      const { unmount } = render(<AvisoGuardado aviso={a} onAccion={() => {}} onCerrar={() => {}} />)
      const aviso = screen.getByRole('status')
      const tocables = [...within(aviso).queryAllByRole('button'), ...within(aviso).queryAllByRole('link')]
      expect(tocables.length).toBeGreaterThan(1)
      for (const t of tocables) tactil(t)
      unmount()
    }
  })
})
// El "Deshacer" de los toasts (clase `min-h-11` en `classNames.actionButton`) lo prueba Toasts.test.tsx.
