import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/require-role'
import { generatePortalDescription } from '@/lib/marketing/portal-descriptions/generator'
import { OPERACIONES_VALORES } from '@/lib/properties/operacion'

/**
 * POST /api/properties/generate-description  (SIN id — la propiedad no existe)
 *
 * Genera titular + subtítulo + cuerpo con el mismo sistema de siempre
 * ("GPT Portales") pero a partir de los campos que el asesor tiene cargados en
 * el formulario de alta. La hermana `[id]/generate-description` sigue existiendo
 * para propiedades ya creadas; esta NO lee ni escribe la base: la propiedad
 * todavía no existe y guardarla primero dispararía los mails de captación por
 * un texto que el asesor puede descartar.
 *
 * TIEMPO: el generador hace UNA sola llamada al modelo (regla dura del
 * proyecto: nunca encadenar varias en un request). Igual le ponemos techo — las
 * funciones de Netlify se cortan bastante antes de los 60s y el gateway
 * responde una página HTML de error, con lo cual el `res.json()` del cliente
 * explota con "Unexpected token '<'". Cortando nosotros primero, el cliente
 * recibe JSON con un motivo legible.
 */
const TECHO_DE_TIEMPO_MS = 24_000

const DatosSchema = z.object({
  address: z.string().trim().min(1).max(300),
  neighborhood: z.string().trim().min(1).max(150),
  city: z.string().trim().max(150).optional(),
  property_type: z.string().trim().min(1).max(60),
  operation_type: z.enum(OPERACIONES_VALORES).optional(),
  asking_price: z.number().finite().positive().max(1e12),
  currency: z.string().trim().max(8),
  rooms: z.number().finite().min(0).max(1000).optional(),
  bedrooms: z.number().finite().min(0).max(1000).optional(),
  bathrooms: z.number().finite().min(0).max(1000).optional(),
  garages: z.number().finite().min(0).max(1000).optional(),
  covered_area: z.number().finite().min(0).max(1_000_000).optional(),
  total_area: z.number().finite().min(0).max(1_000_000).optional(),
  floor: z.number().finite().min(-10).max(300).optional(),
  age: z.number().finite().min(0).max(500).optional(),
  description: z.string().max(5000).optional(),
})

const InputSchema = z.object({
  datos: DatosSchema,
  buyerProfile: z.string().max(500).optional(),
  extraNotes: z.string().max(2000).optional(),
})

/** El abogado no genera copy comercial (mismo criterio que la ruta con id). */
const ROLES_HABILITADOS = ['admin', 'dueno', 'coordinador', 'asesor']

function esCorteDeTiempo(err: unknown): boolean {
  const nombre = (err as { name?: string } | null)?.name
  return nombre === 'TimeoutError' || nombre === 'AbortError'
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    if (!ROLES_HABILITADOS.includes(user.profile.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const parsed = InputSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Faltan datos de la propiedad para generar la descripción.', detail: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const generated = await generatePortalDescription({
      property: parsed.data.datos,
      buyerProfile: parsed.data.buyerProfile,
      extraNotes: parsed.data.extraNotes,
      timeoutMs: TECHO_DE_TIEMPO_MS,
    })

    return NextResponse.json({ ok: true, generated })
  } catch (err) {
    if (esCorteDeTiempo(err)) {
      return NextResponse.json(
        { error: 'El servidor tardó demasiado generando la descripción. Volvé a intentar.' },
        { status: 504 },
      )
    }
    console.error('[generate-description/alta]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
