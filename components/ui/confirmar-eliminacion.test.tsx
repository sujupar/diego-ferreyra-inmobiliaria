// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useConfirmarEliminacion, coincideLaPalabra } from '@/components/ui/confirmar-eliminacion'

describe('coincideLaPalabra', () => {
    it('acepta la palabra exacta', () => {
        expect(coincideLaPalabra('ELIMINAR', 'ELIMINAR')).toBe(true)
    })

    it('perdona lo que hace el teclado del teléfono, no lo que quiso decir el usuario', () => {
        // El autocapitalizado y el espacio que mete el corrector no deberían
        // costar un intento más: eso era la mitad del problema del prompt().
        expect(coincideLaPalabra('eliminar', 'ELIMINAR')).toBe(true)
        expect(coincideLaPalabra('  Eliminar ', 'ELIMINAR')).toBe(true)
        // Pero la fricción sigue: cualquier otra cosa no pasa.
        expect(coincideLaPalabra('elimina', 'ELIMINAR')).toBe(false)
        expect(coincideLaPalabra('', 'ELIMINAR')).toBe(false)
        expect(coincideLaPalabra('sí', 'ELIMINAR')).toBe(false)
    })
})

function Banco({ alResolver }: { alResolver: (v: boolean) => void }) {
    const { confirmarEliminacion, dialogoEliminacion } = useConfirmarEliminacion()
    return (
        <>
            <button
                onClick={async () => {
                    alResolver(await confirmarEliminacion({
                        titulo: 'Vas a eliminar 3 contactos',
                        detalle: 'Las tasaciones asociadas quedan sin contacto.',
                    }))
                }}
            >
                Borrar
            </button>
            {dialogoEliminacion}
        </>
    )
}

describe('useConfirmarEliminacion', () => {
    it('no muestra nada hasta que se lo pide', () => {
        render(<Banco alResolver={() => { }} />)
        expect(screen.queryByRole('alertdialog')).toBeNull()
    })

    it('el botón peligroso arranca deshabilitado y se habilita al escribir la palabra', async () => {
        const usuario = userEvent.setup()
        const resuelto = vi.fn()
        render(<Banco alResolver={resuelto} />)

        await usuario.click(screen.getByRole('button', { name: 'Borrar' }))
        const eliminar = await screen.findByRole('button', { name: 'Eliminar' })
        expect((eliminar as HTMLButtonElement).disabled).toBe(true)

        await usuario.type(screen.getByLabelText(/escribí/i), 'ELIMINAR')
        expect((eliminar as HTMLButtonElement).disabled).toBe(false)

        await usuario.click(eliminar)
        await waitFor(() => expect(resuelto).toHaveBeenCalledWith(true))
    })

    it('cancelar resuelve en false — el botón que la llamó no queda colgado', async () => {
        const usuario = userEvent.setup()
        const resuelto = vi.fn()
        render(<Banco alResolver={resuelto} />)

        await usuario.click(screen.getByRole('button', { name: 'Borrar' }))
        await usuario.click(await screen.findByRole('button', { name: 'Cancelar' }))

        await waitFor(() => expect(resuelto).toHaveBeenCalledWith(false))
        expect(screen.queryByRole('alertdialog')).toBeNull()
    })

    it('es un alertdialog y el campo no pelea con el teclado del teléfono', async () => {
        const usuario = userEvent.setup()
        render(<Banco alResolver={() => { }} />)
        await usuario.click(screen.getByRole('button', { name: 'Borrar' }))

        expect(await screen.findByRole('alertdialog')).not.toBeNull()
        const campo = screen.getByLabelText(/escribí/i)
        expect(campo.getAttribute('autocapitalize')).toBe('characters')
        expect(campo.getAttribute('autocorrect')).toBe('off')
        expect(campo.getAttribute('spellcheck')).toBe('false')
    })

    it('el segundo pedido arranca con el campo vacío', async () => {
        const usuario = userEvent.setup()
        const resuelto = vi.fn()
        render(<Banco alResolver={resuelto} />)

        await usuario.click(screen.getByRole('button', { name: 'Borrar' }))
        await usuario.type(await screen.findByLabelText(/escribí/i), 'ELIMINAR')
        await usuario.click(screen.getByRole('button', { name: 'Cancelar' }))

        await usuario.click(screen.getByRole('button', { name: 'Borrar' }))
        // Si el campo conservara "ELIMINAR", el segundo borrado se confirmaría
        // con un solo toque y sin querer.
        expect((await screen.findByLabelText(/escribí/i) as HTMLInputElement).value).toBe('')
        expect((screen.getByRole('button', { name: 'Eliminar' }) as HTMLButtonElement).disabled).toBe(true)
    })
})
