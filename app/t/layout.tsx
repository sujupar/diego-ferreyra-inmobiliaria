import type { ReactNode } from 'react'
import { Montserrat, Lato } from 'next/font/google'

/**
 * Layout de la página del video de bienvenida (`inmodf.com.ar/t/<código>`). Misma tipografía que
 * las landings del embudo (`app/(funnels)/layout.tsx`), para que la persona reconozca a quien le
 * escribió. Sin Píxel de Meta: el código personal viaja en la URL.
 */
const montserrat = Montserrat({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-funnel-head', display: 'swap' })
const lato = Lato({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-funnel-body', display: 'swap' })

const SUPABASE_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin
  } catch {
    return ''
  }
})()

export default function LayoutVideoBienvenida({ children }: { children: ReactNode }) {
  return (
    <div className={`${montserrat.variable} ${lato.variable} antialiased`}>
      {SUPABASE_ORIGIN && <link rel="preconnect" href={SUPABASE_ORIGIN} crossOrigin="anonymous" />}
      {children}
    </div>
  )
}
