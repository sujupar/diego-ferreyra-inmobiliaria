// @vitest-environment happy-dom
/**
 * Piso móvil de los primitivos (Fase 0 del sistema responsive).
 *
 * Acá el LAYOUT ES LA FUNCIONALIDAD: que un campo mida 16px es lo que evita que
 * iOS haga zoom, que un diálogo tenga techo de altura es lo que hace que el
 * botón de guardar exista en un teléfono, y que un botón mida 44px es lo que
 * hace que se pueda tocar. Nada de eso se puede observar en happy-dom, que no
 * calcula layout ni resuelve media queries. Lo único verificable es que la clase
 * esté puesta en el elemento correcto — así que eso es lo que se verifica.
 *
 * Las clases `max-md:` / `max-sm:` solo existen por debajo de 768 / 640px:
 * ninguna de estas afirmaciones cambia una sola cosa en escritorio.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Textarea } from './textarea'
import { Select } from './select'
import { Button } from './button'
import { Dialog, DialogContent, DialogTitle } from './dialog'
import { Sheet, SheetContent, SheetTitle } from './sheet'
import { Input } from './input'
import {
    Sidebar, SidebarContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider,
    SidebarTrigger,
} from './sidebar'

beforeAll(() => {
    window.matchMedia = ((query: string) => ({
        matches: false, media: query, onchange: null,
        addEventListener: () => { }, removeEventListener: () => { }, dispatchEvent: () => false,
        addListener: () => { }, removeListener: () => { },
    })) as unknown as typeof window.matchMedia
})

/** `useIsMobile` decide por `window.innerWidth`, no por el mock de matchMedia. */
function anchoDeVentana(px: number) {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: px })
}

describe('campos de texto: 16px en celular, 14px en escritorio', () => {
    /**
     * Por debajo de 16px, iOS Safari hace zoom al enfocar y NO lo deshace al
     * salir. El peor caso es el compositor del Inbox: el asesor toca para
     * responder y se le va la conversación de la pantalla.
     */
    it('el Textarea usa `text-base md:text-sm` (era `text-sm` fijo)', () => {
        render(<Textarea aria-label="mensaje" />)
        const campo = screen.getByLabelText('mensaje')
        expect(campo).toHaveClass('text-base')
        expect(campo).toHaveClass('md:text-sm')
        expect(campo.className).not.toMatch(/(^|\s)text-sm(\s|$)/)
    })

    it('el Select nativo usa `text-base md:text-sm` (era `text-sm` fijo)', () => {
        render(<Select aria-label="tipo" options={[{ value: 'a', label: 'A' }]} />)
        const campo = screen.getByLabelText('tipo')
        expect(campo).toHaveClass('text-base')
        expect(campo).toHaveClass('md:text-sm')
        expect(campo.className).not.toMatch(/(^|\s)text-sm(\s|$)/)
    })

    it('el Select sigue siendo un <select> NATIVO (la rueda de iOS es mejor que cualquier popover propio)', () => {
        render(<Select aria-label="tipo" options={[{ value: 'a', label: 'A' }]} />)
        expect(screen.getByLabelText('tipo').tagName).toBe('SELECT')
    })

    it('el Input ya estaba bien y no se tocó — es la plantilla de los otros dos', () => {
        render(<Input aria-label="nombre" />)
        const campo = screen.getByLabelText('nombre')
        expect(campo).toHaveClass('text-base')
        expect(campo).toHaveClass('md:text-sm')
    })
})

describe('botones: piso táctil en celular sin tocar el escritorio', () => {
    /**
     * Ningún tamaño llegaba a los 44px recomendados (el máximo eran 40) y hay
     * 128 usos de `size="sm"` = 32px en filas apretadas.
     */
    it.each([
        ['default', 'h-9', 'max-md:h-11'],
        ['sm', 'h-8', 'max-md:h-10'],
        ['lg', 'h-10', 'max-md:h-11'],
        ['icon', 'size-9', 'max-md:size-11'],
        ['icon-sm', 'size-8', 'max-md:size-10'],
        ['icon-lg', 'size-10', 'max-md:size-11'],
    ] as const)('el tamaño %s conserva %s y suma %s', (size, escritorio, celular) => {
        render(<Button size={size}>Tocame</Button>)
        const boton = screen.getByRole('button', { name: 'Tocame' })
        expect(boton, 'el tamaño de escritorio no se toca').toHaveClass(escritorio)
        expect(boton, 'falta el piso táctil de celular').toHaveClass(celular)
    })

    it('el ☰ del menú hereda el piso: 28px en el riel de escritorio, 44 en el teléfono', () => {
        // `cn()` es tailwind-merge: `size-7` pisa a `size-9` (mismo grupo, sin
        // variante) pero NO a `max-md:size-11`, que lleva prefijo.
        render(<Button size="icon" className="size-7">☰</Button>)
        const boton = screen.getByRole('button', { name: '☰' })
        expect(boton).toHaveClass('size-7')
        expect(boton).toHaveClass('max-md:size-11')
        expect(boton).not.toHaveClass('size-9')
    })
})

describe('diálogos: techo de altura, scroll propio y cierre alcanzable', () => {
    function abrirDialogo(className?: string) {
        render(
            <Dialog open>
                <DialogContent className={className}>
                    <DialogTitle>Nueva tarea</DialogTitle>
                    <p>cuerpo</p>
                </DialogContent>
            </Dialog>,
        )
        return document.querySelector('[data-slot="dialog-content"]')!
    }

    /**
     * Sin techo, el diálogo se recorta arriba y abajo y NO queda nada que
     * scrollear (Radix bloquea el scroll del body): 10 de los 13 diálogos del
     * sistema dejaban el botón de guardar fuera de la pantalla en un teléfono.
     */
    it('tiene techo de altura medido contra el alto REAL de la ventana, y scrollea por dentro', () => {
        const contenido = abrirDialogo()
        expect(contenido).toHaveClass('max-h-[calc(var(--app-vh)-2rem)]')
        expect(contenido).toHaveClass('overflow-y-auto')
        // El gesto que llega al final no se contagia a la página de atrás.
        expect(contenido).toHaveClass('overscroll-contain')
    })

    it('mide contra `--app-vh` y no contra `vh` (en iOS `vh` es el viewport grande y miente ~110px)', () => {
        const contenido = abrirDialogo()
        expect(contenido.className).not.toMatch(/max-h-\[\d+vh\]/)
    })

    it('en pantalla angosta se ancla al borde inferior (se alcanza con el pulgar)', () => {
        const contenido = abrirDialogo()
        for (const clase of [
            'max-sm:top-auto', 'max-sm:bottom-0', 'max-sm:left-0', 'max-sm:right-0',
            'max-sm:w-full', 'max-sm:max-w-none', 'max-sm:translate-x-0', 'max-sm:translate-y-0',
            'max-sm:rounded-b-none',
        ]) {
            expect(contenido, `falta ${clase}`).toHaveClass(clase)
        }
        // Y no queda debajo de la barra de gestos del iPhone.
        expect(contenido).toHaveClass('max-sm:pb-[max(1.5rem,var(--safe-b))]')
    })

    it('el centrado de escritorio queda intacto', () => {
        const contenido = abrirDialogo()
        expect(contenido).toHaveClass('top-[50%]')
        expect(contenido).toHaveClass('left-[50%]')
        expect(contenido).toHaveClass('translate-y-[-50%]')
        expect(contenido).toHaveClass('sm:max-w-lg')
    })

    it('un diálogo que trae su propio max-h sigue mandando (tailwind-merge)', () => {
        const contenido = abrirDialogo('max-h-[85dvh]')
        expect(contenido).toHaveClass('max-h-[85dvh]')
        expect(contenido).not.toHaveClass('max-h-[calc(var(--app-vh)-2rem)]')
    })

    it('la X tiene nombre accesible y 44px de área tocable en celular', () => {
        abrirDialogo()
        const cerrar = screen.getByRole('button', { name: 'Cerrar' })
        expect(cerrar).toHaveAttribute('data-slot', 'dialog-close')
        expect(cerrar).toHaveClass('max-md:size-11')
    })
})

describe('hojas (Sheet): las de arriba y abajo tampoco se pasan de la pantalla', () => {
    function abrirHoja(side: 'top' | 'bottom' | 'left') {
        render(
            <Sheet open>
                <SheetContent side={side}>
                    <SheetTitle>Filtros</SheetTitle>
                </SheetContent>
            </Sheet>,
        )
        return document.querySelector('[data-slot="sheet-content"]')!
    }

    it('la hoja inferior tiene techo, scroll propio y respeta la barra de gestos', () => {
        const hoja = abrirHoja('bottom')
        expect(hoja).toHaveClass('max-h-[calc(var(--app-vh)-2rem)]')
        expect(hoja).toHaveClass('overflow-y-auto')
        expect(hoja).toHaveClass('pb-[var(--safe-b)]')
    })

    it('la hoja superior tiene techo y scroll propio', () => {
        const hoja = abrirHoja('top')
        expect(hoja).toHaveClass('max-h-[calc(var(--app-vh)-2rem)]')
        expect(hoja).toHaveClass('overflow-y-auto')
    })

    it('cualquier hoja contiene su gesto de scroll', () => {
        expect(abrirHoja('left')).toHaveClass('overscroll-contain')
    })

    it('la X tiene nombre accesible, `data-slot` y 44px en celular', () => {
        abrirHoja('bottom')
        const cerrar = screen.getByRole('button', { name: 'Cerrar' })
        expect(cerrar).toHaveAttribute('data-slot', 'sheet-close')
        expect(cerrar).toHaveClass('max-md:size-11')
    })
})

describe('menú lateral en celular: la salida existe', () => {
    /**
     * El panel llevaba `[&>button]:hidden`, que apuntaba justo a la X de
     * `SheetContent`: la única forma de cerrarlo era acertarle a la franja de
     * overlay de la derecha — 32px en un teléfono de 320px. Sumado a que tampoco
     * se cerraba al navegar (eso ya está arreglado en esta rama), el usuario
     * quedaba con el menú abierto tapando la pantalla.
     */
    it('al abrir el panel con el ☰ aparece un botón Cerrar de verdad', async () => {
        anchoDeVentana(390)
        try {
            const user = userEvent.setup()
            render(
                <SidebarProvider>
                    <SidebarTrigger />
                    <Sidebar>
                        <SidebarContent>
                            <SidebarMenu>
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild><a href="/crm">CRM</a></SidebarMenuButton>
                                </SidebarMenuItem>
                            </SidebarMenu>
                        </SidebarContent>
                    </Sidebar>
                </SidebarProvider>,
            )

            await user.click(screen.getByRole('button', { name: 'Alternar menú lateral' }))
            const panel = await screen.findByRole('dialog')
            expect(panel).toHaveAttribute('data-mobile', 'true')
            expect(panel.className, 'volvió el `[&>button]:hidden` que dejaba el panel sin salida')
                .not.toContain('[&>button]:hidden')

            const cerrar = screen.getByRole('button', { name: 'Cerrar' })
            expect(cerrar).toBeInTheDocument()
            expect(cerrar).toHaveClass('max-md:size-11')

            await user.click(cerrar)
            await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        } finally {
            anchoDeVentana(1280)
        }
    })

    it('el panel deja aire abajo para la barra de gestos del iPhone', () => {
        const fuente = readFileSync(resolve(__dirname, 'sidebar.tsx'), 'utf8')
        expect(fuente).toContain('pb-[var(--safe-b)]')
        // Que no vuelva por un className (en los comentarios sí se lo nombra, a
        // propósito: ahí está escrito por qué se sacó).
        const clases = [...fuente.matchAll(/className="([^"]*)"/g)].map(m => m[1])
        expect(clases.some(c => c.includes('[&>button]:hidden'))).toBe(false)
    })
})
