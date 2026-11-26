import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { alcanceContactos } from '@/lib/auth/contact-access'
import { canAccessContact } from '@/lib/auth/entity-access'
import { armarFicha, perfilesANombrar, procesosParaLeerHistorial, type UltimoCambioDeEtapa } from '@/lib/crm/ficha'
import { nombresDePerfiles } from '@/lib/supabase/actividades'
import { leerDatosDeFicha } from '@/lib/supabase/contactos'
import { ultimoCambioDeEtapa } from '@/lib/supabase/deals'

// Persona, proceso activo, detalles, último contacto, procesos, tasaciones agendadas y
// archivos (design.md D4). Service role: la ruta es la ÚNICA barrera, y lo que un asesor
// no ve lo recorta `armarFicha` ANTES de responder (no la pantalla). Un contacto ajeno y
// uno inexistente reciben la misma respuesta.
const NO_ENCONTRADO = { error: 'No encontramos este contacto' }
const SIN_ACCESO = { error: 'No tenés acceso a los contactos.' }

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  // requireAuth fuera del try: lanza NEXT_REDIRECT y un catch lo volvería un 500.
  const user = await requireAuth()
  const alcance = alcanceContactos(user.profile.role)
  if (alcance === 'ninguno') return NextResponse.json(SIN_ACCESO, { status: 403 })
  try {
    const { id } = await params
    if (alcance === 'propios' && !(await canAccessContact(user, id))) {
      return NextResponse.json(NO_ENCONTRADO, { status: 404 })
    }
    const datos = await leerDatosDeFicha(id)
    if (!datos) return NextResponse.json(NO_ENCONTRADO, { status: 404 })

    const ahora = new Date()
    // El historial de etapas se lee solo para los descartados de los últimos 10 minutos
    // (el "Deshacer" de Procesos); para el resto no hace falta.
    const aLeer = procesosParaLeerHistorial(datos.procesos, ahora)
    const [cambios, nombres] = await Promise.all([
      Promise.all(aLeer.map(async (dealId) => [dealId, await ultimoCambioDeEtapa(dealId)] as const)),
      nombresDePerfiles(perfilesANombrar(datos)),
    ])
    const cambiosAPerdido = new Map<string, UltimoCambioDeEtapa>()
    for (const [dealId, cambio] of cambios) if (cambio) cambiosAPerdido.set(dealId, cambio)

    return NextResponse.json(
      armarFicha({ datos, cambiosAPerdido, nombres, usuario: { id: user.id, role: user.profile.role }, ahora }),
    )
  } catch (error) {
    console.error('GET /api/contacts/[id]/ficha error:', error)
    return NextResponse.json({ error: 'No se pudo cargar la ficha. Probá de nuevo.' }, { status: 500 })
  }
}
