import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import { getExperiment, saveExperiment, getAbResults } from '@/lib/funnel/experiment'
import { validateConfigChange, type Variant } from '@/lib/funnel/ab-test'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const FUNNELS = new Set(['tasacion', 'clase_gratuita'])

/**
 * Configuración y resultados del A/B de landings.
 *
 * Mismo gate que el resto de la pantalla de embudos: solo admin y dueño. Mover
 * el reparto cambia a dónde va tráfico pago en vivo, así que no puede quedar
 * detrás de un permiso más laxo.
 */
async function gate() {
  const user = await getUser()
  if (!user || (user.profile.role !== 'admin' && user.profile.role !== 'dueno')) return null
  return user
}

export async function GET(req: NextRequest) {
  const user = await gate()
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  const funnel = sp.get('funnel') ?? 'tasacion'
  if (!FUNNELS.has(funnel)) return NextResponse.json({ error: 'funnel inválido' }, { status: 400 })

  const to = sp.get('to') ?? new Date().toISOString().slice(0, 10)
  const from = sp.get('from') ?? to
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json({ error: 'fechas inválidas' }, { status: 400 })
  }

  const [config, results] = await Promise.all([
    getExperiment(funnel),
    getAbResults(funnel, from, to),
  ])
  return NextResponse.json({ config, results })
}

export async function PATCH(req: NextRequest) {
  const user = await gate()
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const funnel = typeof body.funnel === 'string' ? body.funnel : 'tasacion'
  if (!FUNNELS.has(funnel)) return NextResponse.json({ error: 'funnel inválido' }, { status: 400 })

  const next: { status?: string; splitB?: number; winner?: Variant | null } = {}
  if (body.status !== undefined) next.status = String(body.status)
  if (body.splitB !== undefined) next.splitB = Number(body.splitB)
  // `winner` distingue "no lo mandaron" de "lo mandaron en null" a propósito:
  // apagar el test SIN elegir ganador tiene que ser un error, no un null
  // silencioso que deje la landing servida al azar.
  if ('winner' in body) next.winner = (body.winner as Variant | null) ?? null

  const error = validateConfigChange(next)
  if (error) return NextResponse.json({ error }, { status: 400 })

  // Apagar eligiendo ganador limpia el reparto: el experimento terminó y no
  // puede quedar un split colgado que reviva si alguien vuelve a "running".
  const saved = await saveExperiment(funnel, next, user.id)
  if (!saved) return NextResponse.json({ error: 'No se pudo guardar la configuración.' }, { status: 500 })

  return NextResponse.json({ ok: true, config: saved })
}
