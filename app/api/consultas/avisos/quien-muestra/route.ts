import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { getUser } from '@/lib/auth/get-user'
import { quienMuestraLaPropiedad } from '@/lib/consultas/identificar'

/**
 * GET /api/consultas/avisos/quien-muestra?propiedad=<uuid> → `{ muestraId }`.
 *
 * Al conectar un aviso, la pantalla propone a quien ya muestra OTRO aviso de la
 * misma propiedad. Sin avisos conectados, `null`: la pantalla deja elegir y
 * nunca propone a quien la captó (es otra comisión).
 *
 * Solo operaciones, como conectar.
 */
export const dynamic = 'force-dynamic'

const ROLES_PERMITIDOS = ['admin', 'dueno', 'coordinador']
const Id = z.string().uuid()

function error(status: number, mensaje: string) {
  return NextResponse.json({ error: mensaje }, { status })
}

export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user || !user.profile.is_active) return error(401, 'Iniciá sesión de nuevo')
  if (!ROLES_PERMITIDOS.includes(user.profile.role)) return error(403, 'No tenés permiso para conectar avisos con propiedades')

  const propiedad = req.nextUrl.searchParams.get('propiedad')
  if (!Id.safeParse(propiedad).success || !propiedad) return error(400, 'La propiedad no es válida')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return error(500, 'Faltan las credenciales de Supabase en el servidor')
  try {
    return NextResponse.json({ muestraId: await quienMuestraLaPropiedad(createClient(url, key), propiedad) })
  } catch (e) {
    console.error('[GET /api/consultas/avisos/quien-muestra]', e)
    return error(500, 'No pudimos ver quién muestra la propiedad')
  }
}
