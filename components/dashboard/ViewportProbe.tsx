'use client'

import { useViewportHeight } from '@/hooks/use-viewport-height'

/**
 * No dibuja nada: existe solo para correr `useViewportHeight` dentro del layout
 * del dashboard, que es un componente de SERVIDOR y no puede usar hooks.
 * Montarlo acá y no en cada pantalla garantiza que `--app-vh` esté al día en
 * toda la app (lo usan `h-app`, el techo de los diálogos y el chat).
 */
export function ViewportProbe() {
    useViewportHeight()
    return null
}
