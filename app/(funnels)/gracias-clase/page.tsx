import type { Metadata } from 'next'

export const metadata: Metadata = { title: '¡Gracias! | Clase', robots: { index: false, follow: false } }

export default function GraciasClase() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <h1 className="font-[family-name:var(--font-funnel-head)] text-3xl font-extrabold text-[#0d2d49]">
        ¡Estás anotado! 🎉
      </h1>
      <p className="mt-4 text-[#555]">
        Te enviamos el acceso a la clase por email y WhatsApp. Revisá tu bandeja (y el spam, por las
        dudas).
      </p>
    </main>
  )
}
