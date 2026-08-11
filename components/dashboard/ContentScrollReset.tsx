'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Lleva el área de contenido al ORIGEN en cada navegación — arriba y a la
 * izquierda.
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
        if (!panel) return
        panel.scrollTop = 0
        // El eje X también. `#contenido` hoy recorta de costado
        // (`overflow-x: hidden` en globals.css), pero un contenedor recortado
        // SIGUE siendo desplazable por programa: alcanza con que algo adentro
        // llame a `focus()` o a `scrollIntoView()` sobre un elemento que asoma
        // para que el navegador corra el panel y lo deje corrido. Sin esta
        // línea ese corrimiento sobrevive a la navegación y la pantalla
        // siguiente abre ya desplazada — parte de por qué el dueño lo describió
        // como "muchas pantallas" y no como una.
        panel.scrollLeft = 0
    }, [pathname])

    return null
}
