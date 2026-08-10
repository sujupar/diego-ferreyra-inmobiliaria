'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Lleva el área de contenido al tope en cada navegación.
 *
 * Desde que `#contenido` es el scroller de la app (y no el documento), el
 * navegador ya NO tiene nada que scrollear al cambiar de ruta: sin esto, entrar
 * a una propiedad desde el medio del listado te deja mirando la mitad de la
 * ficha nueva. Es la contracara obligatoria de la cadena de alto del layout.
 */
export function ContentScrollReset() {
    const pathname = usePathname()

    useEffect(() => {
        // `scrollTop` y no `scrollTo({behavior})`: acá no queremos animación
        // (es un cambio de página, no un salto dentro de la misma) y es lo que
        // soporta cualquier entorno.
        const panel = document.getElementById('contenido')
        if (panel) panel.scrollTop = 0
    }, [pathname])

    return null
}
