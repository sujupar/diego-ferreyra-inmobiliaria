// @vitest-environment happy-dom
// crm-cartera-por-rol, tarea 6.1: las piezas de la lista dibujan cada texto de la spec para
// cada estado de la fila, y la fila es UN enlace sin botones adentro.
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CabeceraFilas, FilaProceso } from './FilaProceso'
import { BarraEtapas } from './BarraEtapas'
import { SegmentoAbiertos } from './SegmentoAbiertos'
import { FichasFiltros } from './FichasFiltros'
import { CargarMas, PieCartera } from './PieCartera'
import { AvisoFuente, CargandoCartera, ErrorCartera, NadaUrgente, VacioConFiltros } from './EstadosCartera'
import { AHORA_PRUEBA as AHORA, ar, filaPrueba, pasoPrueba, TOMAS } from './datos-prueba'
import type { FilaComun } from '@/lib/crm/cartera'
import { etapasDeVista } from '@/lib/crm/cartera-pantalla'

function fila(f: FilaComun, o: { conAsesor?: boolean; conTasacion?: boolean; modo?: 'cartera' | 'contactos' } = {}) {
  return render(
    <ul className="@container/lista">
      <li>
        <FilaProceso fila={f} modo={o.modo ?? 'cartera'} conAsesor={o.conAsesor ?? true} conTasacion={o.conTasacion ?? false} volver="/crm?etapa=solicitud" ahora={AHORA} />
      </li>
    </ul>,
  )
}

describe('FilaProceso', () => {
  it('Sofía Lanús: nombre, propiedad, etapa, último contacto y próximo paso', () => {
    fila(
      filaPrueba({
        nombre: 'Sofía Lanús',
        propiedad: 'PH 4 amb · Colegiales',
        direccion: 'Conesa 1250',
        ultimoContacto: { at: ar('2026-12-02', '09:40'), que: 'llamada', resultado: 'no_atendio' },
        proximo: pasoPrueba('2026-12-03', '09:00'),
      }),
    )
    const enlace = screen.getByRole('link', { name: 'Abrir la ficha de Sofía Lanús' })
    expect(enlace).toHaveTextContent('Sofía Lanús')
    expect(enlace).toHaveTextContent('PH 4 amb · Colegiales · Conesa 1250')
    expect(enlace).toHaveTextContent('Solicitud')
    expect(enlace).toHaveTextContent('hace 1 h')
    expect(enlace).toHaveTextContent('Llamada · no atendió')
    expect(enlace).toHaveTextContent('Llamada 2')
    expect(enlace).toHaveTextContent('Mañana 9:00')
  })

  it('la fila es un solo enlace a la ficha con la vuelta, sin botones adentro', () => {
    const f = filaPrueba({ contactoId: 'c-77' })
    fila(f)
    const enlace = screen.getByRole('link')
    expect(enlace).toHaveAttribute('href', '/contacts/c-77?volver=%2Fcrm%3Fetapa%3Dsolicitud')
    expect(within(enlace).queryAllByRole('button')).toHaveLength(0)
    expect(within(enlace).queryAllByRole('link')).toHaveLength(0)
    expect(enlace.querySelector('[tabindex]')).toBeNull()
  })

  it('un proceso sin contacto abre /pipeline/<id>', () => {
    fila(filaPrueba({ id: 'deal-9', contactoId: null }))
    expect(screen.getByRole('link')).toHaveAttribute('href', '/pipeline/deal-9')
  })

  it('la etapa es un chip neutro, sin fondo de color', () => {
    fila(filaPrueba({ etapa: 'coordinada', abierto: true }))
    const chip = screen.getByText('Coordinada')
    expect(chip).toHaveAttribute('data-neutro')
    expect(chip.className).not.toMatch(/bg-brand/)
  })

  it('vencida: "Vencida hace 1 h" con ícono y en rojo; de hoy con el color de la marca', () => {
    const { unmount } = fila(filaPrueba({ proximo: pasoPrueba('2026-12-02', '09:40') }))
    const v = screen.getByText('Vencida hace 1 h').parentElement
    expect(v?.className).toMatch(/destructive/)
    expect(v?.querySelector('svg')).not.toBeNull()
    unmount()
    fila(filaPrueba({ proximo: pasoPrueba('2026-12-02', '17:00') }))
    const h = screen.getByText('Hoy 17:00').parentElement
    expect(h?.className).toMatch(/text-brand/)
    expect(h?.querySelector('svg')).not.toBeNull()
  })

  it('sin fecha, espera de la primera llamada, tasación y "Nada agendado"', () => {
    const { unmount } = fila(filaPrueba({ proximo: pasoPrueba(null, null) }))
    expect(screen.getByText('Sin fecha')).toBeInTheDocument()
    unmount()
    const r2 = fila(
      filaPrueba({
        ultimoContacto: null,
        proximo: pasoPrueba('2026-12-02', '10:12', { titulo: 'Primera llamada', espera: { registradoEn: ar('2026-12-02', '10:12') } }),
      }),
    )
    expect(screen.getByText('Primera llamada')).toBeInTheDocument()
    expect(screen.getByText('Espera hace 28 min')).toBeInTheDocument()
    expect(screen.getByText('Sin contacto todavía')).toBeInTheDocument()
    r2.unmount()
    const r3 = fila(filaPrueba({ etapa: 'coordinada', proximo: pasoPrueba('2026-12-02', '12:30', { clase: 'tasacion', titulo: 'Tasación' }) }))
    expect(screen.getByText('Tasación')).toBeInTheDocument()
    expect(screen.getByText('Hoy 12:30')).toBeInTheDocument()
    r3.unmount()
    fila(filaPrueba({ proximo: null }))
    expect(screen.getByText('Nada agendado')).toBeInTheDocument()
  })

  it('"Sin contacto registrado" antes del registro y "—" en un cerrado', () => {
    const { unmount } = fila(filaPrueba({ ultimoContacto: null, anteriorAlRegistro: true }))
    expect(screen.getByText('Sin contacto registrado')).toBeInTheDocument()
    unmount()
    fila(filaPrueba({ etapa: 'descartado', abierto: false, ultimoContacto: null, cerradoEn: ar('2026-11-27', '10:00') }))
    // Uno es el último contacto; el otro, el asesor que todavía no corresponde.
    expect(screen.getAllByText('—')).toHaveLength(2)
    expect(screen.getByText('Descartado hace 5 días')).toBeInTheDocument()
  })

  it('seguimiento sin movimiento: en rojo con ícono y "Sin movimiento"', () => {
    const lejos = new Date('2026-12-20T13:40:00Z')
    render(
      <FilaProceso
        fila={filaPrueba({ etapa: 'seguimiento', ultimoContacto: { at: ar('2026-11-28', '12:00'), que: 'llamada', resultado: 'volver_a_llamar' } })}
        modo="cartera"
        conAsesor
        conTasacion={false}
        volver="/crm"
        ahora={lejos}
      />,
    )
    const t = screen.getByText('hace 22 días')
    expect(t.className).toMatch(/destructive/)
    expect(t.querySelector('svg')).not.toBeNull()
    expect(screen.getByText('Sin movimiento')).toBeInTheDocument()
  })

  it('columna Asesor: nombre, "Sin asesor" con ícono, "—" oculto en la tarjeta, "(dado de baja)"', () => {
    const { unmount } = fila(filaPrueba({ etapa: 'seguimiento', asesor: { ...TOMAS, activo: true } }))
    expect(screen.getByText('Tomás Agüero')).toBeInTheDocument()
    unmount()
    const r2 = fila(filaPrueba({ etapa: 'seguimiento', asesor: null }))
    expect(screen.getByText('Sin asesor').querySelector('svg')).not.toBeNull()
    r2.unmount()
    const r3 = fila(filaPrueba({ etapa: 'seguimiento', asesor: { ...TOMAS, activo: false } }))
    expect(screen.getByText('Tomás Agüero (dado de baja)')).toBeInTheDocument()
    r3.unmount()
    const { container } = fila(filaPrueba({ etapa: 'solicitud', asesor: null }))
    const vacio = container.querySelector('[data-asesor-vacio]')
    expect(vacio).toHaveClass('hidden')
    expect(vacio?.className).toContain('@min-[44rem]/lista:flex')
  })

  it('"No se pudo cargar" cuando falló el último contacto o las tareas', () => {
    fila(filaPrueba({ ultimoContacto: 'error', proximo: 'error' }))
    expect(screen.getAllByText('No se pudo cargar')).toHaveLength(2)
  })

  it('el tercer renglón de la tasación, sin "con" si hay columna Asesor', () => {
    const f = filaPrueba({
      etapa: 'coordinada',
      direccion: 'Bacacay 2450',
      tasacion: { fecha: '2026-12-03', hora: '11:00', instante: ar('2026-12-03', '11:00'), asesor: 'Tomás Agüero', direccion: 'Bacacay 2450' },
      proximo: pasoPrueba('2026-12-02', '15:00', { titulo: 'Confirmar el horario' }),
    })
    const { unmount } = fila(f, { conTasacion: true, conAsesor: true })
    expect(screen.getByText('Tasación mañana 11:00')).toBeInTheDocument()
    unmount()
    fila(f, { conTasacion: true, conAsesor: false })
    expect(screen.getByText('Tasación mañana 11:00 con Tomás Agüero')).toBeInTheDocument()
  })

  it('cada dato lleva su etiqueta para la tarjeta, que se esconde en la tabla', () => {
    fila(filaPrueba())
    const etq = screen.getByText('Último contacto')
    expect(etq.className).toContain('@min-[44rem]/lista:hidden')
    expect(screen.getByText('Próximo paso')).toBeInTheDocument()
  })

  it('en Contactos: "Proceso" con el origen, y "Sin proceso"', () => {
    const { unmount } = fila({ ...filaPrueba({ origen: 'referido' }) }, { modo: 'contactos' })
    expect(screen.getByText('Referido')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveTextContent('11 5555-0148')
    unmount()
    fila({ ...filaPrueba(), etapa: null, abierto: false, proximo: null, ultimoContacto: null }, { modo: 'contactos' })
    expect(screen.getByText('Sin proceso')).toBeInTheDocument()
  })

  it('con "Seleccionar" la fila es un botón que se marca, no un enlace', async () => {
    const alAlternar = vi.fn()
    render(
      <FilaProceso fila={filaPrueba({ nombre: 'Mirta Sosa' })} modo="cartera" conAsesor conTasacion={false} volver="/crm" ahora={AHORA} seleccion={{ marcada: false, alAlternar }} />,
    )
    expect(screen.queryByRole('link')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Seleccionar a Mirta Sosa' }))
    expect(alAlternar).toHaveBeenCalledTimes(1)
  })
})

describe('CabeceraFilas', () => {
  it('columnas del CRM, de Contactos y de cerrados', () => {
    const { container, rerender } = render(<CabeceraFilas modo="cartera" conAsesor cerrados={false} />)
    expect(container).toHaveTextContent('Persona y propiedadEtapaÚltimo contactoPróximo pasoAsesor')
    rerender(<CabeceraFilas modo="contactos" conAsesor={false} cerrados />)
    expect(container).toHaveTextContent('PersonaProcesoÚltimo contactoCierre')
    expect(container).not.toHaveTextContent('Asesor')
  })
})

describe('BarraEtapas', () => {
  const conteo = { solicitud: 185, coordinada: 15, no_realizada: 7, realizada: 21, entregada: 21, seguimiento: 100, clase_gratuita: 138, comprador: 6, captada: 19, descartado: 472 }
  it('coordinación: "Por etapa" con sus tres etapas, sin Clase gratuita', () => {
    render(<BarraEtapas grupos={etapasDeVista('coordinacion', 'abiertos', conteo)} conteo={conteo} elegida="" alTocar={() => {}} />)
    expect(screen.getByText('Por etapa')).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(3)
    expect(screen.queryByText('Clase gratuita')).toBeNull()
  })
  it('dueño: embudo y fuera del embudo, con los números; la elegida con aria-pressed', async () => {
    const alTocar = vi.fn()
    render(<BarraEtapas grupos={etapasDeVista('dueno', 'abiertos', conteo)} conteo={conteo} elegida="seguimiento" alTocar={alTocar} />)
    expect(screen.getByText('Embudo de tasación')).toBeInTheDocument()
    expect(screen.getByText('Fuera del embudo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Seguimiento 100' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Clase gratuita 138' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Coordinada 15' }))
    expect(alTocar).toHaveBeenCalledWith('coordinada')
  })
  it('ninguna etapa tiene fondo de color', () => {
    render(<BarraEtapas grupos={etapasDeVista('dueno', 'cerrados', conteo)} conteo={conteo} elegida="" alTocar={() => {}} />)
    for (const b of screen.getAllByRole('button')) expect(b.className).not.toMatch(/bg-(brand|destructive|primary)/)
    expect(screen.getByRole('button', { name: 'Descartado 472' })).toBeInTheDocument()
  })
  it('con la lista caída no muestra ningún número', () => {
    render(<BarraEtapas grupos={etapasDeVista('dueno', 'abiertos', conteo)} conteo={conteo} elegida="" alTocar={() => {}} error />)
    expect(screen.getByText('No se pudo contar por etapa')).toBeInTheDocument()
    expect(screen.queryByText('185')).toBeNull()
  })
})

describe('SegmentoAbiertos', () => {
  it('"Abiertos 493" / "Cerrados 491" y sin números si no hay datos', async () => {
    const alCambiar = vi.fn()
    const { rerender } = render(
      <SegmentoAbiertos etiquetas={['Abiertos', 'Cerrados']} numeros={[493, 491]} valor="abiertos" alCambiar={alCambiar} nombreGrupo="Qué procesos ver" />,
    )
    expect(screen.getByRole('button', { name: 'Abiertos 493' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Cerrados 491' }))
    expect(alCambiar).toHaveBeenCalledWith('cerrados')
    rerender(<SegmentoAbiertos etiquetas={['Abiertos', 'Cerrados']} numeros={null} valor="abiertos" alCambiar={alCambiar} nombreGrupo="Qué procesos ver" />)
    expect(screen.getByRole('button', { name: 'Abiertos' })).toBeInTheDocument()
  })
})

describe('FichasFiltros', () => {
  it('cada ficha se saca de a una y está "Limpiar filtros"', async () => {
    const alSacar = vi.fn()
    const alLimpiar = vi.fn()
    render(
      <FichasFiltros
        fichas={[
          { clave: 'q', texto: 'Busca: «pinto»' },
          { clave: 'etapa', texto: 'Etapa: Seguimiento' },
          { clave: 'origen', texto: 'Origen: Referido' },
        ]}
        alSacar={alSacar}
        alLimpiar={alLimpiar}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Sacar el filtro Origen: Referido' }))
    expect(alSacar).toHaveBeenCalledWith('origen')
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(alLimpiar).toHaveBeenCalled()
  })
  it('sin filtros no dibuja nada', () => {
    const { container } = render(<FichasFiltros fichas={[]} alSacar={() => {}} alLimpiar={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('Pie y estados', () => {
  it('"Cargar 25 más" y el pie', async () => {
    const alCargar = vi.fn()
    render(
      <>
        <CargarMas alCargar={alCargar} />
        <PieCartera texto="Mostrando 50 de 493 procesos abiertos" />
      </>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cargar 25 más' }))
    expect(alCargar).toHaveBeenCalled()
    expect(screen.getByText('Mostrando 50 de 493 procesos abiertos')).toBeInTheDocument()
  })
  it('cargando: esqueleto sin números', () => {
    const { container } = render(<CargandoCartera />)
    expect(container.textContent).toBe('Cargando…')
  })
  it('error de la lista con "Reintentar"', async () => {
    const alReintentar = vi.fn()
    render(<ErrorCartera titulo="No se pudo cargar la lista de procesos" alReintentar={alReintentar} />)
    expect(screen.getByText('Los filtros siguen ahí. El resto de la plataforma funciona.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(alReintentar).toHaveBeenCalled()
  })
  it('vacío con filtros, nada urgente y aviso de una fuente', () => {
    render(
      <>
        <VacioConFiltros titulo="Ningún proceso coincide con estos filtros" alLimpiar={() => {}} />
        <NadaUrgente />
        <AvisoFuente texto="No se pudieron cargar las tareas." alReintentar={() => {}} />
      </>,
    )
    expect(screen.getByText('Probá sacar algún filtro o buscar de otra forma.')).toBeInTheDocument()
    expect(screen.getByText('No hay solicitudes sin primer contacto ni llamadas vencidas. Abajo sigue el resto de la cartera.')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar las tareas.')
  })
})
