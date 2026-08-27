/**
 * `GET /r/<código>` — el acortador propio.
 *
 * Es PÚBLICA a propósito: la abre el asesor desde su WhatsApp, sin sesión del
 * CRM. La protección no es el login, es el código (7 caracteres al azar), y lo
 * único que hay del otro lado es un chat de WhatsApp. Ver `lib/links/short-link.ts`.
 */
import { NextResponse } from 'next/server'
import { resolver, contarVisita } from '@/lib/links/short-link-store'
import { paginaDeRebote } from '@/lib/links/short-link'

export const runtime = 'nodejs'
// Cada código es de un solo uso práctico y el destino puede cambiar: nunca cachear.
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params

  const target = await resolver(code)
  if (!target) {
    return new NextResponse(
      '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><p>Este enlace no existe o venció.</p>',
      { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } },
    )
  }

  // No se espera: el asesor ya se está yendo al chat.
  void contarVisita(code)

  return new NextResponse(paginaDeRebote(target), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-robots-tag': 'noindex, nofollow',
      // La página solo rebota; no hay nada que embeber ni terceros que cargar.
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
      'referrer-policy': 'no-referrer',
    },
  })
}
