import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { getUser } from '@/lib/auth/get-user'
import { avisosSinPropiedad } from '@/lib/consultas/avisos-datos'
import { conectarAviso, ConsultaNoConectable } from '@/lib/consultas/identificar'

/**
 * Avisos sin propiedad (spec Entrega 2 §3.2):
 *  - GET  → una tarjeta por aviso con cuántas consultas tiene, y cuántas
 *           consultas no se pueden agrupar.
 *  - POST { portal, codigo, propertyId, muestraId } → conecta TODAS las
 *           consultas de ese aviso con la propiedad y con quien la muestra
 *           (que NO es quien la captó), en una sola llamada.
 *
 * Solo operaciones (admin, dueño, coordinador), igual que conectar una consulta
 * suelta: conectar un aviso decide a quién le llegan sus consultas futuras.
 */
export const dynamic = 'force-dynamic'

const ROLES_PERMITIDOS = ['admin', 'dueno', 'coordinador']

const Cuerpo = z.object({
  portal: z.string().trim().min(1).max(40),
  // Tal cual está guardado (la conexión compara por igualdad exacta): sin trim.
  codigo: z.string().min(1).max(120),
  propertyId: z.string().uuid(),
  muestraId: z.string().uuid(),
})

function error(status: number, mensaje: string) {
  return NextResponse.json({ error: mensaje }, { status })
}

function clienteServicio() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan las credenciales de Supabase en el servidor')
  return createClient(url, key)
}

async function permiso(): Promise<NextResponse | null> {
  const user = await getUser()
  if (!user || !user.profile.is_active) return error(401, 'Iniciá sesión de nuevo')
  if (!ROLES_PERMITIDOS.includes(user.profile.role)) return error(403, 'No tenés permiso para conectar avisos con propiedades')
  return null
}

export async function GET() {
  const negado = await permiso()
  if (negado) return negado
  try {
    return NextResponse.json(await avisosSinPropiedad(clienteServicio()))
  } catch (e) {
    console.error('[GET /api/consultas/avisos]', e)
    return error(500, 'No pudimos cargar los avisos sin propiedad')
  }
}

export async function POST(req: NextRequest) {
  const negado = await permiso()
  if (negado) return negado
  const body = await req.json().catch(() => null)
  const parsed = Cuerpo.safeParse(body)
  if (!parsed.success) {
    const sinMuestra = parsed.error.issues.every((i) => i.path[0] === 'muestraId')
    return error(400, sinMuestra ? 'Elegí quién muestra la propiedad' : 'Faltan datos para conectar el aviso')
  }
  try {
    return NextResponse.json(await conectarAviso(clienteServicio(), parsed.data))
  } catch (e) {
    if (e instanceof ConsultaNoConectable) return error(e.status, e.message)
    console.error('[POST /api/consultas/avisos]', e)
    return error(500, 'No pudimos conectar el aviso con la propiedad')
  }
}
