import type { Metadata } from 'next'

export const metadata: Metadata = { title: '¡Gracias! | Tasación', robots: { index: false, follow: false } }

export default function GraciasTasacion() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <h1 className="font-[family-name:var(--font-funnel-head)] text-3xl font-extrabold text-[#0d2d49]">
        ¡Recibimos tu solicitud! 🎉
      </h1>
      <p className="mt-4 text-[#555]">
        Nuestro equipo te va a contactar a la brevedad para coordinar tu Tasación Estratégica. Revisá
        tu WhatsApp y tu email.
      </p>
    </main>
  )
}
