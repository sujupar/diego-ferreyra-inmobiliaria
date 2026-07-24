/**
 * E1.7 — Layout premium de la landing pública.
 *
 * Carga una tipografía serif editorial (Cormorant Garamond — la MISMA voz
 * tipográfica de los anuncios de Meta, para que el embudo anuncio→landing se
 * sienta cohesivo) y envuelve la página en `.landing-root`, el scope donde
 * `app/globals.css` aplica el sistema de diseño premium (serif en títulos,
 * ritmo, selección de marca). No renderiza <html>/<body> — eso lo hace el
 * layout raíz; este solo agrega la fuente + el scope, sin tocar el dashboard.
 */
import { Cormorant_Garamond, Jost } from 'next/font/google'
import type { ReactNode } from 'react'

const serifDisplay = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-landing-serif',
  display: 'swap',
})

// E1.9 — sans editorial (la MISMA que usa la referencia de lujo). Da el aire
// "revista de arquitectura" en eyebrows, specs y cuerpo.
const sansEditorial = Jost({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-landing-sans',
  display: 'swap',
})

export default function LandingLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${serifDisplay.variable} ${sansEditorial.variable} landing-root`}>
      {children}
    </div>
  )
}
