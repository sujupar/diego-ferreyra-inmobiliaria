import { NextResponse } from 'next/server'
import { registrarApertura } from '@/lib/video-bienvenida/enlaces'
import { esCodigoValido } from '@/lib/video-bienvenida/codigo'

/**
 * Registra que alguien abrió su enlace del video de bienvenida (D4). La llama la página desde el
 * navegador, una vez por pestaña: la vista previa de WhatsApp no ejecuta JS y no cuenta.
 *
 * Responde SIEMPRE `{ ok: true }`, exista o no el código: así no sirve para averiguar qué códigos
 * existen ni devuelve nada de nadie. La función de la base solo la ejecuta el rol de servicio.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params
  if (esCodigoValido(codigo)) await registrarApertura(codigo)
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
