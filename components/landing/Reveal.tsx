/**
 * E1.7 — Reveal: aparición de la sección al hacer scroll (fade-up sutil).
 *
 * DISEÑO ROBUSTO: es un SERVER component y NO usa JS. La animación se resuelve
 * 100% por CSS (`.reveal-section` en globals.css, vía scroll-driven animations
 * `animation-timeline: view()`). Por eso el contenido está SIEMPRE visible:
 *  - Sin JavaScript → visible (la anima el navegador, no el JS).
 *  - Navegador sin soporte de scroll-timeline → visible, estático (fallback @supports).
 *  - prefers-reduced-motion → visible, estático.
 * Nunca queda una sección invisible esperando a que hidrate el JS.
 */
import type { ReactNode } from 'react'

export function Reveal({ children }: { children: ReactNode }) {
  return <div className="reveal-section">{children}</div>
}
