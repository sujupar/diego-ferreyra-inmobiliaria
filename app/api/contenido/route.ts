import { NextResponse } from 'next/server'
import { contenidoAuth } from '@/lib/contenido/route-auth'
import { contenidoDb } from '@/lib/contenido/db'

// GET: todo el estado de la Central de Contenido en una sola lectura.
export async function GET() {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const db = contenidoDb()
  const [pieces, ideas, formats, corrections] = await Promise.all([
    db.from('content_pieces').select('*').order('publish_date').order('slot'),
    db.from('content_ideas').select('*').order('categoria').order('prioridad').order('created_at'),
    db.from('content_formats').select('*').order('created_at'),
    db.from('content_corrections').select('*').order('corrected_at', { ascending: false }),
  ])
  const err = pieces.error || ideas.error || formats.error || corrections.error
  if (err) return NextResponse.json({ error: 'DB: ' + err.message }, { status: 500 })

  return NextResponse.json({
    pieces: pieces.data,
    ideas: ideas.data,
    formats: formats.data,
    corrections: corrections.data,
  })
}
