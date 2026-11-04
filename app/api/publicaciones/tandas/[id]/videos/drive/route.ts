import { NextResponse } from 'next/server'
import { contenidoAuth } from '@/lib/contenido/route-auth'
import { altaVideosDrive } from '@/lib/publicaciones/servidor/drive'
import { leerBody, respuestaDeError } from '@/lib/publicaciones/servidor/http'
import { altaDriveSchema } from '@/lib/publicaciones/validacion'

type Ctx = { params: Promise<{ id: string }> }

// POST: da de alta en la tanda los videos de Drive elegidos. La copia la hace después `/videos/[id]/traer`.
export async function POST(req: Request, { params }: Ctx) {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const { id } = await params
    const { archivos } = await leerBody(req, altaDriveSchema)
    return NextResponse.json(await altaVideosDrive(id, archivos))
  } catch (e) {
    return respuestaDeError(e, 'alta videos drive')
  }
}
