'use client'

import Image from 'next/image'
import { FunnelMetaPixel } from '@/components/funnel/FunnelMetaPixel'
import { FunnelClickToPlayVideo } from '@/components/funnel/FunnelClickToPlayVideo'

interface GraciasClaseClientProps {
  pixelId: string
  logoUrl: string
  videoUrl: string
  posterUrl: string
}

export function GraciasClaseClient({ pixelId, logoUrl, videoUrl, posterUrl }: GraciasClaseClientProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center bg-white px-4 py-12 text-center">
      <FunnelMetaPixel pixelId={pixelId} contentName="Gracias Clase" />

      <Image
        src={logoUrl}
        alt="Diego Ferreyra Inmobiliaria"
        width={260}
        height={57}
        className="mx-auto mb-8 h-auto w-[240px]"
        priority
      />

      <h1 className="font-[family-name:var(--font-funnel-head)] text-3xl font-extrabold text-[#0d2d49] sm:text-4xl">
        🥳 ¡Ya estás dentro! 🎉
      </h1>

      <p className="mt-4 max-w-2xl text-[#555]">
        Recordá: esta CLASE te va a enseñar el PASO A PASO de todo lo que necesitás para vender tu
        propiedad — desde cómo EVITAR perder miles de dólares en la venta, vender al mejor precio,
        hasta cómo encontrar compradores listos para decidir.
      </p>

      <div className="mt-8 w-full max-w-3xl">
        <FunnelClickToPlayVideo src={videoUrl} poster={posterUrl} className="aspect-video" />
      </div>

      <p className="mt-8 text-[#555]">
        📲 Revisá tu WhatsApp — te enviamos un mensaje con la información de la Clase.
      </p>
      <p className="mt-2 font-bold text-[#0d2d49]">💻 Clase 100% Virtual</p>

      <a
        href="https://wa.link/b83223"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-10 inline-block rounded-full bg-[#00BF63] px-10 py-5 text-lg font-extrabold text-white shadow-lg transition hover:scale-105 hover:bg-[#00a957]"
      >
        Quiero una Tasación Gratuita
      </a>
      <p className="mt-3 text-sm text-[#555]">¡Hablá conmigo y coordinemos!</p>

      <footer className="mt-16 text-xs text-[#999]">
        © {new Date().getFullYear()} Inmobiliaria Diego Ferreyra
      </footer>
    </main>
  )
}
