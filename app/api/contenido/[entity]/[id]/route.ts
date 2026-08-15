import { NextResponse } from 'next/server'
import { contenidoAuth, ENTIDADES, filtrarCampos, type Entidad } from '@/lib/contenido/route-auth'
import { contenidoDb } from '@/lib/contenido/db'

type Ctx = { params: Promise<{ entity: string; id: string }> }

// PATCH: edita campos whitelisteados de una fila.
export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { entity, id } = await params
  if (!(entity in ENTIDADES)) return NextResponse.json({ error: 'Entidad desconocida' }, { status: 404 })
  const ent = entity as Entidad

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const patch = filtrarCampos(ent, body)
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 })

  const db = contenidoDb()
  const { data, error } = await db
    .from(ENTIDADES[ent].tabla)
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: 'DB: ' + error.message }, { status: 500 })
  return NextResponse.json({ row: data })
}

// DELETE: borra una fila (las piezas normalmente se marcan 'descartado', pero
// el borrado existe para limpiar errores de carga).
export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { entity, id } = await params
  if (!(entity in ENTIDADES)) return NextResponse.json({ error: 'Entidad desconocida' }, { status: 404 })

  const db = contenidoDb()
  const { error } = await db.from(ENTIDADES[entity as Entidad].tabla).delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'DB: ' + error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
