import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { alcanceContactos } from '@/lib/auth/contact-access'
import { canAccessContact } from '@/lib/auth/entity-access'
import { esquemaNuevaActividad, numerarLlamadas, resolverOcurrio, validarVolverEl } from '@/lib/crm/actividades'
import { armarActividadDeFicha } from '@/lib/crm/actividad-de-ficha'
import { elegirDealActivo } from '@/lib/crm/deal-activo'
import { instanteDesdeAR } from '@/lib/crm/horario-laboral'
import { aplicarCadencia, CADENCIA_VACIA } from '@/lib/supabase/cadencia'
import {
  existeContacto,
  insertarActividad,
  leerActividadPorToken,
  leerProcesosDelContacto,
  listarActividades,
  llamadasNoAnuladasDelContacto,
  nombresDePerfiles,
  tareasCreadasPor,
  type FilaActividad,
  type FiltroActividad,
} from '@/lib/supabase/actividades'
import type { UserWithProfile } from '@/types/auth.types'

// Todo corre con service role: esta ruta es la ÚNICA barrera (design.md D4). Un contacto
// ajeno y uno inexistente reciben la MISMA respuesta, para no confirmar que existe.
const NO_ENCONTRADO = { error: 'No encontramos este contacto' }
const SIN_ACCESO = { error: 'No tenés acceso a los contactos.' }
const NO_SE_GUARDO = { error: 'No se pudo guardar. Probá de nuevo.' }
/**
 * Respuesta de una llamada o un WhatsApp (D4): corre `aplicarCadencia` y arma la
 * actividad con su número de intento y la tarea que creó (leída de la base).
 */
async function respuestaDeIntento(fila: FilaActividad, user: UserWithProfile) {
  const { cadencia, intento, pendiente } = await aplicarCadencia(fila, { id: user.id, role: user.profile.role })
  const t = cadencia.tareaCreada
  return {
    actividad: armarActividadDeFicha(fila, {
      intento,
      autorNombre: user.profile.full_name ?? null,
      tareaCreada: t ? { id: t.id, title: t.title, due_date: t.due_date, due_time: t.due_time } : null,
      usuario: { id: user.id, role: user.profile.role },
    }),
    cadencia,
    pendiente,
  }
}

/** Una actividad que llega anulada: sin número (no ocupa uno) y con la cadencia vacía (D4, paso 2). */
function respuestaDeAnulada(fila: FilaActividad, user: UserWithProfile) {
  return {
    actividad: armarActividadDeFicha(fila, {
      intento: null,
      autorNombre: user.profile.full_name ?? null,
      tareaCreada: null,
      usuario: { id: user.id, role: user.profile.role },
    }),
    cadencia: CADENCIA_VACIA,
    pendiente: false,
  }
}

function respuestaDeNota(fila: FilaActividad, user: UserWithProfile) {
  return {
    actividad: armarActividadDeFicha(fila, {
      intento: null,
      // En la nota nueva y en la repetida el autor es quien pide (si no, es un 409).
      autorNombre: user.profile.full_name ?? null,
      tareaCreada: null,
      usuario: { id: user.id, role: user.profile.role },
    }),
    // Una nota no corre la cadencia (D4): ni tareas creadas ni cerradas.
    cadencia: null,
    pendiente: false,
  }
}

const TAMANO_PAGINA = 50
const FILTROS: FiltroActividad[] = ['todo', 'llamadas', 'notas', 'actividad']

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  const alcance = alcanceContactos(user.profile.role)
  if (alcance === 'ninguno') return NextResponse.json(SIN_ACCESO, { status: 403 })
  try {
    const { id } = await params
    const sp = new URL(request.url).searchParams
    const filtroPedido = sp.get('filtro') ?? 'todo'
    const filtro = FILTROS.find((f) => f === filtroPedido)
    if (!filtro) return NextResponse.json({ error: 'Filtro desconocido.' }, { status: 400 })
    const antesPedido = sp.get('antes')
    let antes: string | null = null
    if (antesPedido) {
      const instante = Date.parse(antesPedido)
      if (Number.isNaN(instante)) return NextResponse.json({ error: 'La fecha de la página no es válida.' }, { status: 400 })
      antes = new Date(instante).toISOString()
    }

    if (alcance === 'propios' && !(await canAccessContact(user, id))) {
      return NextResponse.json(NO_ENCONTRADO, { status: 404 })
    }
    if (alcance === 'todos' && !(await existeContacto(id))) {
      return NextResponse.json(NO_ENCONTRADO, { status: 404 })
    }

    // Una fila de más dice si hay otra página, sin contar todo.
    const [filas, llamadas] = await Promise.all([
      listarActividades(id, filtro, antes, TAMANO_PAGINA + 1),
      llamadasNoAnuladasDelContacto(id),
    ])
    const pagina = filas.slice(0, TAMANO_PAGINA)
    const autores = [...new Set(pagina.map((f) => f.created_by).filter((x): x is string => !!x))]
    const [nombres, tareas] = await Promise.all([
      nombresDePerfiles(autores),
      tareasCreadasPor(pagina.map((f) => f.id)),
    ])
    // La actividad se ve completa para quien abre la ficha (D4): es la historia de la persona.
    const numeros = numerarLlamadas(llamadas)
    const usuario = { id: user.id, role: user.profile.role }
    const actividades = pagina.map((f) =>
      armarActividadDeFicha(f, {
        intento: f.kind === 'call' ? (numeros.get(f.id) ?? null) : null,
        autorNombre: f.created_by ? (nombres.get(f.created_by) ?? null) : null,
        tareaCreada: tareas.get(f.id) ?? null,
        usuario,
      }),
    )
    return NextResponse.json({ actividades, hay_mas: filas.length > TAMANO_PAGINA })
  } catch (error) {
    console.error('GET /api/contacts/[id]/activities error:', error)
    return NextResponse.json({ error: 'No se pudo cargar la actividad. Probá de nuevo.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // requireAuth fuera del try: lanza NEXT_REDIRECT y un catch lo volvería un 500.
  const user = await requireAuth()
  const alcance = alcanceContactos(user.profile.role)
  if (alcance === 'ninguno') return NextResponse.json(SIN_ACCESO, { status: 403 })
  try {
    const { id } = await params
    let cuerpo: unknown
    try {
      cuerpo = await request.json()
    } catch {
      return NextResponse.json({ error: 'El pedido no se entiende.' }, { status: 400 })
    }
    const validado = esquemaNuevaActividad.safeParse(cuerpo)
    if (!validado.success) {
      return NextResponse.json({ error: validado.error.issues[0]?.message ?? 'El pedido no se entiende.' }, { status: 400 })
    }
    const nueva = validado.data
    const ahora = new Date()
    // "Volver a llamar" exige día y hora futuros; con otro resultado `volver_el` se ignora.
    let callbackAt: string | null = null
    if (nueva.kind === 'call' && nueva.call_outcome === 'volver_a_llamar') {
      const volverEl = nueva.volver_el
      const v = validarVolverEl(volverEl, ahora)
      // `!volverEl` no pasa nunca (validarVolverEl ya lo rechaza); va para que el tipo cierre.
      if (!v.ok || !volverEl) {
        return NextResponse.json({ error: v.ok ? 'Elegí el día y la hora para volver a llamar.' : v.error }, { status: 400 })
      }
      callbackAt = instanteDesdeAR(volverEl.fecha, volverEl.hora).toISOString()
    }

    if (alcance === 'propios' && !(await canAccessContact(user, id))) {
      return NextResponse.json(NO_ENCONTRADO, { status: 404 })
    }
    const { existe, procesos } = await leerProcesosDelContacto(id)
    if (!existe) return NextResponse.json(NO_ENCONTRADO, { status: 404 })
    const activo = elegirDealActivo(procesos)

    if (nueva.kind !== 'note') {
      // Lista cerrada. La hora la calcula el servidor desde "hace cuántos minutos"; sin
      // minutos (o con 0) no se manda `occurred_at` y la base lo pone igual a `created_at`.
      const ocurrio = resolverOcurrio(ahora, nueva.hace_minutos)
      const resultado = await insertarActividad({
        contact_id: id,
        deal_id: activo?.id ?? null,
        kind: nueva.kind,
        body: nueva.body ?? null,
        created_by: user.id,
        client_token: nueva.client_token,
        ...(nueva.kind === 'call' ? { call_outcome: nueva.call_outcome, callback_at: callbackAt } : {}),
        ...(ocurrio ? { occurred_at: ocurrio.toISOString() } : {}),
      })
      if (resultado.ok) {
        return NextResponse.json(await respuestaDeIntento(resultado.fila, user), { status: 201 })
      }
      // El mismo guardado llegó dos veces (D4 y D7). Solo lo propio: otro autor, otro
      // contacto o un token que usó una nota → 409 sin ningún dato del otro registro.
      const existente = await leerActividadPorToken(nueva.client_token)
      if (!existente || existente.contact_id !== id || existente.created_by !== user.id || existente.kind === 'note') {
        return NextResponse.json(NO_SE_GUARDO, { status: 409 })
      }
      // Ya anulada ("Deshacer" antes de que llegara este reintento de red): se devuelve tal
      // cual y NO se corre la cadencia, que volvería a cerrar lo que el deshacer reabrió.
      if (existente.voided_at) {
        return NextResponse.json(respuestaDeAnulada(existente, user), { status: 200 })
      }
      // Si no, se sigue con esa fila desde el paso 3: completa lo que haya faltado.
      return NextResponse.json(await respuestaDeIntento(existente, user), { status: 200 })
    }

    // Lista cerrada: autor = sesión, proceso = el activo de ahora. Sin `occurred_at`:
    // lo pone la base igual a `created_at` (D2, `resolverOcurrio`).
    const resultado = await insertarActividad({
      contact_id: id,
      deal_id: activo?.id ?? null,
      kind: 'note',
      body: nueva.body,
      created_by: user.id,
      client_token: nueva.client_token,
    })
    if (resultado.ok) return NextResponse.json(respuestaDeNota(resultado.fila, user), { status: 201 })

    // El mismo guardado llegó dos veces. Solo se devuelve lo propio (D4): otro autor u
    // otro contacto → 409 sin ningún dato del otro registro. Un token de nota que ya usó
    // una llamada propia tampoco es "el mismo guardado": su respuesta lleva cadencia.
    const existente = await leerActividadPorToken(nueva.client_token)
    if (!existente || existente.contact_id !== id || existente.created_by !== user.id || existente.kind !== 'note') {
      return NextResponse.json(NO_SE_GUARDO, { status: 409 })
    }
    return NextResponse.json(respuestaDeNota(existente, user), { status: 200 })
  } catch (error) {
    console.error('POST /api/contacts/[id]/activities error:', error)
    return NextResponse.json(NO_SE_GUARDO, { status: 500 })
  }
}
