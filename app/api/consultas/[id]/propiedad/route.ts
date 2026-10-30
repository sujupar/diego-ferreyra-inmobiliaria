import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { getUser } from '@/lib/auth/get-user'
import { conectarConsulta, ConsultaNoConectable } from '@/lib/consultas/identificar'

/**
 * POST /api/consultas/[id]/propiedad — conecta una consulta sin propiedad con
 * su propiedad (la pantalla lo pide antes de agendar la visita). Si su código
 * identifica al aviso, se conectan TODAS las consultas de ese aviso y se
 * recuerda (ver lib/consultas/identificar.ts). `recordar` ya no decide nada: se
 * acepta y se ignora para que una pestaña abierta con la pantalla vieja no
 * reciba un 400.
 *
 * Solo operaciones (admin, dueño, coordinador), igual que identificar un aviso
 * en /api/portal-inquiries/identify: recordar cambia a quién se le avisan las
 * consultas futuras, no es una decisión del asesor.
 */
export const dynamic = 'force-dynamic'

const ROLES_PERMITIDOS = ['admin', 'dueno', 'coordinador']

const Id = z.string().uuid()
const Cuerpo = z.object({
  propertyId: z.string().uuid(),
  // Quien la MUESTRA (no quien la captó): a esa persona le llegan las consultas.
  muestraId: z.string().uuid(),
  recordar: z.boolean().optional(),
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user || !user.profile.is_active) return error(401, 'Iniciá sesión de nuevo')
  if (!ROLES_PERMITIDOS.includes(user.profile.role)) {
    return error(403, 'No tenés permiso para conectar consultas con propiedades')
  }

  const { id } = await params
  if (!Id.safeParse(id).success) return error(400, 'La consulta no es válida')

  const body = await req.json().catch(() => null)
  const parsed = Cuerpo.safeParse(body)
  if (!parsed.success) {
    const sinMuestra = parsed.error.issues.every((i) => i.path[0] === 'muestraId')
    return error(400, sinMuestra ? 'Elegí quién muestra la propiedad' : 'Faltan datos para conectar la consulta')
  }

  try {
    const r = await conectarConsulta(clienteServicio(), {
      consultaId: id,
      propertyId: parsed.data.propertyId,
      muestraId: parsed.data.muestraId,
    })
    return NextResponse.json(r)
  } catch (e) {
    if (e instanceof ConsultaNoConectable) return error(e.status, e.message)
    console.error('[POST /api/consultas/[id]/propiedad]', e)
    return error(500, 'No pudimos conectar la consulta con la propiedad')
  }
}
