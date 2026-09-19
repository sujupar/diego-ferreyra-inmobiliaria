// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FunnelLeadModal } from './FunnelLeadModal'

const base = {
  open: true,
  onClose: () => {},
  title: 'Completá los Datos',
  subtitle: 'Necesitamos 2 datos clave.',
  variant: 'tasacion' as const,
  submitLabel: 'SOLICITAR',
}

describe('FunnelLeadModal', () => {
  it('no renderiza cuando open=false', () => {
    render(<FunnelLeadModal {...base} open={false} onSubmit={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('valida campos y llama onSubmit con datos válidos', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<FunnelLeadModal {...base} onSubmit={onSubmit} />)

    // submit vacío → error, no llama onSubmit
    await user.click(screen.getByRole('button', { name: 'SOLICITAR' }))
    expect(onSubmit).not.toHaveBeenCalled()
    // (Esta prueba estaba rota en main: esperaba "ingresá tu nombre" y un campo con etiqueta
    // "Teléfono", textos que el formulario dejó de tener. Nadie la corría. 2026-09-19.)
    expect(screen.getByRole('alert')).toHaveTextContent(/escribí tu nombre/i)

    await user.type(screen.getByLabelText('Nombre'), 'Juan')
    await user.type(screen.getByPlaceholderText('11 XXXX XXXX'), '1133224455')
    await user.type(screen.getByLabelText('Email'), 'juan@mail.com')
    await user.click(screen.getByRole('button', { name: 'SOLICITAR' }))

    // El envío valida el teléfono con una librería que se carga aparte: es asíncrono.
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: 'Juan', email: 'juan@mail.com' })
  })
})
