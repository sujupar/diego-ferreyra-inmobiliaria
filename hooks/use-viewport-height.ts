'use client'

import { useEffect } from 'react'

/**
 * Publica el alto REALMENTE VISIBLE de la ventana en `--app-vh`, sobre
 * `<html>`.
 *
 * POR QUÉ NO ALCANZA `dvh`: `dvh` sigue a la barra del navegador, pero NO al
 * teclado. En iOS el teclado achica el viewport VISUAL y deja el de LAYOUT
 * igual, así que un contenedor de `100dvh` sigue midiendo la pantalla entera y
 * el compositor del chat queda debajo del teclado. `window.visualViewport.height`
 * es lo único que refleja las dos cosas.
 *
 * El valor por defecto (`100dvh`) lo pone `app/globals.css`: en el servidor y
 * sin JavaScript el layout sigue siendo el de siempre, nunca cero.
 */
export function useViewportHeight() {
    useEffect(() => {
        const vv = window.visualViewport
        if (!vv) return

        // El evento `scroll` del visual viewport se dispara en cada cuadro del
        // desplazamiento y casi siempre con el mismo alto. Escribir una custom
        // property en `<html>` invalida el estilo de TODO el documento, así que
        // solo se escribe cuando el número cambió de verdad.
        let ultimo = -1
        const aplicar = () => {
            const alto = Math.round(vv.height)
            if (alto === ultimo) return
            ultimo = alto
            document.documentElement.style.setProperty('--app-vh', `${alto}px`)
        }

        aplicar()
        vv.addEventListener('resize', aplicar)
        vv.addEventListener('scroll', aplicar)
        return () => {
            vv.removeEventListener('resize', aplicar)
            vv.removeEventListener('scroll', aplicar)
            // Al desmontar vuelve a mandar el valor de globals.css (100dvh).
            document.documentElement.style.removeProperty('--app-vh')
        }
    }, [])
}
