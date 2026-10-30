import { NextResponse } from 'next/server'
import { contenidoAuth } from '@/lib/contenido/route-auth'
import { publicacionesDb } from '@/lib/publicaciones/db'
import type { EstadoEstilo } from '@/lib/publicaciones/estilo'
import { resumenEstilo } from '@/lib/publicaciones/servidor/estilo'
import { ErrorHttp, leerBody, respuestaDeError } from '@/lib/publicaciones/servidor/http'
import { patchAjustesSchema } from '@/lib/publicaciones/validacion'

/** El interruptor de publicar solo lo cambian ellos: es lo que hace que algo salga a las redes. */
const ROLES_INTERRUPTOR = ['admin', 'dueno']

async function leer() {
  const { data, error } = await publicacionesDb()
    .from('publicacion_ajustes')
    .select('publicacion_automatica, horarios, estilo')
    .eq('id', true)
    .single()
  if (error) throw new Error(`DB: ${error.message}`)
  return {
    publicacion_automatica: data.publicacion_automatica as boolean,
    horarios: data.horarios,
    estilo: resumenEstilo(data.estilo as EstadoEstilo),
  }
}

export async function GET() {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const ajustes = await leer()
    return NextResponse.json({
      ajustes,
      puedeCambiarInterruptor: ROLES_INTERRUPTOR.includes(auth.user.profile.role),
    })
  } catch (e) {
    return respuestaDeError(e, 'leer ajustes')
  }
}

export async function PATCH(req: Request) {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const cambios = await leerBody(req, patchAjustesSchema)
    if (cambios.publicacion_automatica !== undefined && !ROLES_INTERRUPTOR.includes(auth.user.profile.role)) {
      throw new ErrorHttp(403, 'La publicación automática la cambian admin y dueño')
    }
    const db = publicacionesDb()
    const patch: Record<string, unknown> = {}
    if (cambios.publicacion_automatica !== undefined) patch.publicacion_automatica = cambios.publicacion_automatica
    if (cambios.horarios !== undefined) patch.horarios = cambios.horarios
    if (cambios.guia !== undefined) {
      const { data, error } = await db.from('publicacion_ajustes').select('estilo').eq('id', true).single()
      if (error) throw new Error(`DB: ${error.message}`)
      const estilo = data.estilo as EstadoEstilo
      if (estilo.etapa !== 'listo') throw new ErrorHttp(409, 'La guía se edita cuando terminó de aprenderse')
      patch.estilo = { ...estilo, guia: cambios.guia.normalize('NFC') }
    }
    if (Object.keys(patch).length > 0) {
      const { error } = await db.from('publicacion_ajustes').update(patch).eq('id', true)
      if (error) throw new Error(`DB: ${error.message}`)
    }
    return NextResponse.json({ ajustes: await leer() })
  } catch (e) {
    return respuestaDeError(e, 'actualizar ajustes')
  }
}
