// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { RevisionMensajes, mensajesDeFabrica, mensajesDelReel, problemaDeMensajes, type MensajesEditables } from './RevisionMensajes'
import { FRASES_CON_PRIVADO, FRASES_SIN_PRIVADO, PRIVADO_POR_DEFECTO } from '@/lib/social/reels/textos-por-defecto'

function Probador({ inicial = mensajesDeFabrica(), privados = false, onCambio }: { inicial?: MensajesEditables; privados?: boolean; onCambio?: (m: MensajesEditables) => void }) {
  const [m, setM] = useState(inicial)
  return (
    <RevisionMensajes
      valor={m}
      onCambiar={(v) => { setM(v); onCambio?.(v) }}
      palabraDeEjemplo="doblas"
      slugLanding="depto-doblas"
      privadosActivos={privados}
    />
  )
}

describe('RevisionMensajes', () => {
  it('muestra las 3 frases, las 3 de respaldo, el privado, el botón y el mensaje del enlace, precargados', () => {
    render(<Probador />)
    FRASES_CON_PRIVADO.forEach((f, i) => expect((screen.getByLabelText(`Frase ${i + 1} cuando el privado sale`) as HTMLInputElement).value).toBe(f))
    FRASES_SIN_PRIVADO.forEach((f, i) => expect((screen.getByLabelText(`Frase ${i + 1} si el privado no sale`) as HTMLInputElement).value).toBe(f))
    expect((screen.getByLabelText('Mensaje privado') as HTMLTextAreaElement).value).toBe(PRIVADO_POR_DEFECTO)
    expect((screen.getByLabelText('Texto del botón') as HTMLInputElement).value).toBe('Sí, pasámela')
    expect((screen.getByLabelText('Mensaje que acompaña al enlace') as HTMLTextAreaElement).value).toBe('Acá la tenés 👇')
  })

  it('muestra el comentario de ejemplo con la palabra del reel y el enlace real de la landing', () => {
    render(<Probador />)
    expect(screen.getByText('doblas')).toBeTruthy()
    expect(screen.getByText(/\/p\/depto-doblas$/)).toBeTruthy()
  })

  it('con los privados apagados avisa que HOY se usan las frases de respaldo', () => {
    render(<Probador privados={false} />)
    expect(screen.getByText('hoy se usan estas')).toBeTruthy()
  })

  it('con los privados activos no muestra ese aviso', () => {
    render(<Probador privados />)
    expect(screen.queryByText('hoy se usan estas')).toBeNull()
  })

  it('cada frase se puede editar', () => {
    const onCambio = vi.fn()
    render(<Probador onCambio={onCambio} />)
    fireEvent.change(screen.getByLabelText('Frase 2 cuando el privado sale'), { target: { value: 'Te lo mandé 📩' } })
    expect(onCambio).toHaveBeenLastCalledWith(expect.objectContaining({
      respuestas_con_privado: [FRASES_CON_PRIVADO[0], 'Te lo mandé 📩', FRASES_CON_PRIVADO[2]],
    }))
  })

  it('avisa si una frase de respaldo promete un privado', () => {
    render(<Probador />)
    fireEvent.change(screen.getByLabelText('Frase 1 si el privado no sale'), { target: { value: 'Te escribí al privado' } })
    expect(screen.getByRole('status').textContent).toMatch(/promete un privado/)
  })

  it('un botón de más de 20 caracteres muestra el motivo', () => {
    const m = { ...mensajesDeFabrica(), dm_boton: 'x'.repeat(21) }
    render(<Probador inicial={m} />)
    expect(screen.getByRole('alert').textContent).toMatch(/botón/)
  })
})

describe('mensajesDelReel / problemaDeMensajes', () => {
  it('completa lo que falta con los textos de fábrica, igual que el procesador', () => {
    const m = mensajesDelReel({ respuestas_con_privado: ['Una sola 📩'], respuestas_sin_privado: null, dm_texto: null, dm_boton: '', dm_seguimiento: null })
    expect(m.respuestas_con_privado).toEqual(['Una sola 📩', '', ''])
    expect(m.respuestas_sin_privado).toEqual([...FRASES_SIN_PRIVADO])
    expect(m.dm_texto).toBe(PRIVADO_POR_DEFECTO)
    expect(m.dm_boton).toBe('Sí, pasámela')
  })

  it('sin ninguna frase no deja guardar', () => {
    expect(problemaDeMensajes({ ...mensajesDeFabrica(), respuestas_con_privado: ['', '', ''] })).toMatch(/al menos una/)
  })

  it('los textos de fábrica se pueden guardar tal cual', () => {
    expect(problemaDeMensajes(mensajesDeFabrica())).toBeNull()
  })
})
