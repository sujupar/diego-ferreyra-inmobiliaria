import { NextResponse } from 'next/server'
import { contenidoAuth, ENTIDADES, filtrarCampos, type Entidad } from '@/lib/contenido/route-auth'
import { contenidoDb } from '@/lib/contenido/db'

// POST: crea una fila de la entidad (pieces | ideas | formats | corrections).
export async function POST(req: Request, { params }: { params: Promise<{ entity: string }> }) {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { entity } = await params
  if (!(entity in ENTIDADES)) return NextResponse.json({ error: 'Entidad desconocida' }, { status: 404 })
  const ent = entity as Entidad

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const fila = filtrarCampos(ent, body)
  for (const campo of ENTIDADES[ent].obligatorios) {
    if (!fila[campo]) return NextResponse.json({ error: `Falta ${campo}` }, { status: 400 })
  }
  if (ent === 'pieces') fila.created_by = auth.user.id

  const db = contenidoDb()
  const { data, error } = await db.from(ENTIDADES[ent].tabla).insert(fila).select('*').single()
  if (error) return NextResponse.json({ error: 'DB: ' + error.message }, { status: 500 })
  return NextResponse.json({ row: data })
}
