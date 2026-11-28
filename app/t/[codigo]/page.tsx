import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { leerSesion } from '@/lib/auth/sesion'
import { esCodigoValido } from '@/lib/video-bienvenida/codigo'
import { leerEnlacePorCodigo, leerTramosPrevios } from '@/lib/video-bienvenida/enlaces'
import { segundosVistos } from '@/lib/video-bienvenida/tramos'
import { esVisitaDelEquipo } from '@/lib/video-bienvenida/equipo'
import { CONTENIDO } from '@/lib/video-bienvenida/contenido'
import { PaginaVideo } from '@/components/video-bienvenida/PaginaVideo'
import { getActiveTestimonials } from '@/lib/funnel/testimonials'

/**
 * Página personal del video de bienvenida (change tasacion-video-bienvenida, D4). Pública por
 * código (middleware: `/t/`). Dinámica: es de UNA persona.
 *
 * Título y vista previa NUNCA llevan el nombre: si alguien reenvía el enlace, la tarjeta que arma
 * WhatsApp no tiene por qué decir cómo se llama quien pidió la tasación. `no-referrer`: el código
 * no viaja a los sitios que se abran desde acá.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Diego Ferreyra Inmobiliaria',
  description: 'Un caso real, paso a paso.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
  openGraph: { title: 'Diego Ferreyra Inmobiliaria', description: 'Un caso real, paso a paso.' },
}

export default async function PaginaDelVideo({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params
  if (!esCodigoValido(codigo)) notFound()

  const enlace = await leerEnlacePorCodigo(codigo)
  if (!enlace) notFound()

  const almacen = await cookies()
  const sesion = await leerSesion(createClient(almacen))
  const medir = !esVisitaDelEquipo({ haySesionValida: !!sesion, nombresDeCookies: almacen.getAll().map((c) => c.name) })

  const [previos, testimonios] = await Promise.all([
    medir ? leerTramosPrevios(codigo) : Promise.resolve(null),
    getActiveTestimonials(),
  ])
  const segundosPrevios = previos ? segundosVistos(previos.watchedBuckets, previos.durationS) : 0

  return (
    <PaginaVideo
      codigo={codigo}
      titular={CONTENIDO.titular(enlace.nombre)}
      medir={medir}
      segundosPrevios={segundosPrevios}
      testimonios={testimonios}
    />
  )
}
