'use client'

import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * Barra de progreso global de navegación. Se activa cuando el usuario hace
 * click en un Link de Next.js y desaparece cuando la nueva ruta termina de
 * renderizar. Da feedback visual inmediato durante el "tiempo muerto" entre
 * el click y el render del loading.tsx de la nueva ruta.
 */
export function NavigationProgress() {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [visible, setVisible] = useState(false)
    const [progress, setProgress] = useState(0)

    // Click en cualquier <a> o <Link> dentro del layout → arranca el progress
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement
            const anchor = target.closest('a')
            if (!anchor) return
            const href = anchor.getAttribute('href')
            if (!href || href.startsWith('http') || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
            if (e.metaKey || e.ctrlKey || e.shiftKey || anchor.target === '_blank') return
            // Mismo path → no navegar (evita progress bar fantasma)
            const sameUrl = href === pathname || href === `${pathname}${typeof window !== 'undefined' ? window.location.search : ''}`
            if (sameUrl) return

            setVisible(true)
            setProgress(15)
            let p = 15
            const interval = setInterval(() => {
                p = Math.min(p + Math.random() * 12, 85)
                setProgress(p)
            }, 150)
            const cleanup = setTimeout(() => clearInterval(interval), 5000)

            const w = window as Window & {
                __navProgressInterval?: ReturnType<typeof setInterval>
                __navProgressCleanup?: ReturnType<typeof setTimeout>
            }
            // Limpiar cualquier timer anterior antes de empezar uno nuevo
            if (w.__navProgressInterval) clearInterval(w.__navProgressInterval)
            if (w.__navProgressCleanup) clearTimeout(w.__navProgressCleanup)
            w.__navProgressInterval = interval
            w.__navProgressCleanup = cleanup
        }
        document.addEventListener('click', handleClick)
        return () => document.removeEventListener('click', handleClick)
    }, [pathname])

    // Pathname o search params cambió → completar y ocultar
    useEffect(() => {
        const w = window as Window & {
            __navProgressInterval?: ReturnType<typeof setInterval>
            __navProgressCleanup?: ReturnType<typeof setTimeout>
        }
        if (w.__navProgressInterval) {
            clearInterval(w.__navProgressInterval)
            w.__navProgressInterval = undefined
        }
        if (w.__navProgressCleanup) {
            clearTimeout(w.__navProgressCleanup)
            w.__navProgressCleanup = undefined
        }
        if (visible) {
            setProgress(100)
            const t = setTimeout(() => {
                setVisible(false)
                setProgress(0)
            }, 200)
            return () => clearTimeout(t)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname, searchParams])

    if (!visible) return null

    return (
        <div
            className="fixed top-0 left-0 right-0 z-[100] h-0.5 bg-primary/20 pointer-events-none"
            aria-hidden="true"
        >
            <div
                className="h-full bg-primary transition-[width] duration-200 ease-out shadow-[0_0_8px_rgba(26,84,144,0.5)]"
                style={{ width: `${progress}%` }}
            />
        </div>
    )
}
