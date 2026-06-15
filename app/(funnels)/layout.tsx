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

export default function FunnelLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${montserrat.variable} ${lato.variable} min-h-screen bg-white font-[family-name:var(--font-funnel-body)] text-[#333] antialiased`}
    >
      {children}
    </div>
  )
}
