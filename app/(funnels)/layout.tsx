import type { ReactNode } from 'react'
import { Montserrat, Lato } from 'next/font/google'

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-funnel-head',
  display: 'swap',
})
const lato = Lato({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-funnel-body',
  display: 'swap',
})

// Origen de Supabase Storage (poster LCP del hero) para abrir el TLS temprano.
const SUPABASE_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin
  } catch {
    return ''
  }
})()

export default function FunnelLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${montserrat.variable} ${lato.variable} min-h-screen bg-white font-[family-name:var(--font-funnel-body)] text-[#333] antialiased`}
    >
      {/* React 19 sube estos <link> al <head>. Acelera el poster (LCP) y el Pixel sin bloquear. */}
      {SUPABASE_ORIGIN && <link rel="preconnect" href={SUPABASE_ORIGIN} crossOrigin="anonymous" />}
      <link rel="preconnect" href="https://connect.facebook.net" />
      <link rel="preconnect" href="https://www.clarity.ms" />
      {children}
    </div>
  )
}
