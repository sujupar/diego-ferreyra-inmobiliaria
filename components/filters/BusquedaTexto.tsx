'use client'

import { Search, X } from 'lucide-react'
import { normalizarBusqueda } from '@/lib/filters/busqueda-texto'
import { useBorradorConEspera } from './use-borrador-con-espera'

interface Props {
    /** El texto que rige hoy (el de la barra de direcciones). */
    value: string
    /** Se llama con el texto ya normalizado cuando hay que aplicarlo. */
    onChange: (valor: string) => void
    placeholder?: string
    /** Nombre del campo para lectores de pantalla. */
    etiqueta?: string
    esperaMs?: number
}

/**
 * Campo de búsqueda de los listados.
 *
 * Aplica solo, sin botón, poco después de que la persona deja de escribir —
 * pero NO en cada tecla: cada aplicación es un pedido al servidor y una entrada
 * en el historial del navegador. Enter aplica sin esperar.
 */
export function BusquedaTexto({
    value,
    onChange,
    placeholder = 'Buscar por dirección, barrio, tipo…',
    etiqueta = 'Buscar',
    esperaMs,
}: Props) {
    const { borrador, escribir, aplicarYa, limpiar } = useBorradorConEspera({
        value,
        onChange,
        normalizar: normalizarBusqueda,
        esperaMs,
    })

    return (
        // El contenedor va dentro de una barra flexible: sin ancho propio se
        // encoge al contenido y el `w-full` del campo no sirve de nada. En
        // celular ocupa todo el ancho; de tablet para arriba, lo suyo.
        <div className="relative w-full sm:w-auto">
            <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
                type="search"
                aria-label={etiqueta}
                placeholder={placeholder}
                value={borrador}
                onChange={e => escribir(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter') {
                        e.preventDefault()
                        aplicarYa()
                    }
                }}
                // `appearance-none` saca la crucecita nativa de `type=search`
                // de WebKit: ya hay un botón propio, y el nativo no lleva
                // nombre accesible ni avisa a React.
                className="h-9 w-full appearance-none rounded-md border border-input bg-background pl-8 pr-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring sm:w-72 [&::-webkit-search-cancel-button]:hidden"
            />
            {borrador !== '' && (
                <button
                    type="button"
                    onClick={limpiar}
                    aria-label="Limpiar búsqueda"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            )}
        </div>
    )
}
