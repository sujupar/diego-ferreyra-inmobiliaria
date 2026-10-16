import type { Metadata } from 'next'
import { leerEncuestaPublica } from '@/lib/visitas/encuesta/publica-servidor'
import { EncuestaVisita } from '@/components/encuesta/EncuestaVisita'
import { EncuestaNoDisponible } from '@/components/encuesta/EncuestaNoDisponible'

/**
 * La encuesta post-visita (spec §3.6 + adenda §11.3). Pública por token (middleware: `/encuesta/`).
 * Dinámica: los datos son de UNA persona y cambian con cada respuesta (nada de caché). Al cliente
 * solo viaja `EncuestaPublica`, datos planos (frontera servidor→cliente).
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Contanos tu visita · Diego Ferreyra Inmobiliaria',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function PaginaEncuesta({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  let resultado: Awaited<ReturnType<typeof leerEncuestaPublica>>
  try {
    resultado = await leerEncuestaPublica(token, new Date())
  } catch (e) {
    console.error('[encuesta] no se pudo armar la página', e)
    return <EncuestaNoDisponible motivo="error" />
  }
  if (resultado.tipo !== 'disponible') return <EncuestaNoDisponible motivo={resultado.tipo} />
  return (
    <main className="min-h-[100dvh] bg-background">
      <EncuestaVisita encuesta={resultado.encuesta} />
    </main>
  )
}
