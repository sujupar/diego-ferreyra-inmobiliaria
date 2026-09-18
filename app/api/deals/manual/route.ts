import { NextRequest, NextResponse } from 'next/server'
import { createDeal } from '@/lib/supabase/deals'
import { encontrarOCrearContacto } from '@/lib/supabase/contactos'
import { requirePermission } from '@/lib/auth/require-role'
import { ROLE_PERMISSIONS } from '@/lib/auth/roles'
import type { Role } from '@/types/auth.types'
import {
  validarClienteNuevo,
  etapaInicial,
  debeNotificarCreacion,
  type MotivoProceso,
} from '@/lib/deals/proceso-manual'

/**
 * Crea el proceso de un trabajo hecho a mano: una tasación de un referido, de
 * un cliente histórico, o una propiedad que llegó sin pasar por el embudo.
 *
 * POR QUÉ ESTÁ ACÁ Y NO EN EL NAVEGADOR (2026-09-17): antes la pantalla de
 * "Nueva tasación" creaba el proceso con tres `fetch` encadenados después de
 * guardar. Si alguno fallaba —y falló— no se avisaba: quedaban tasaciones sin
 * proceso y procesos fantasma con la dirección como nombre del cliente. Acá es
 * un solo pedido, con los datos validados antes de escribir nada.
 *
 * Reglas que hace cumplir (decisiones del dueño, ver el spec del 2026-09-17):
 *  - Cliente de verdad: nombre y teléfono. Nunca la dirección como nombre.
 *  - Asesor obligatorio: sin asesor el proceso no aparece en SU CRM.
 *  - La etapa es la que corresponde y no se saltea ninguna.
 *  - No se manda el email de "Tasación agendada": no se está agendando nada.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission('pipeline.schedule')
    const body = await request.json().catch(() => ({}))
    const motivo: MotivoProceso = body?.motivo === 'captacion' ? 'captacion' : 'tasacion'

    // Un asesor solo crea procesos para sí mismo. No es una restricción
    // estética: el CRM le muestra únicamente los procesos asignados a él, así
    // que uno asignado a otra persona le desaparecería apenas lo crea.
    // Como en `lib/auth/scope.ts`: un rol desconocido cae del lado seguro
    // (no puede asignarle el proceso a otra persona) en vez de romper.
    const permisos = ROLE_PERMISSIONS[user.profile.role as Role] as string[] | undefined
    const puedeAsignarAOtro = !!permisos?.includes('pipeline.view_all')
    const propioId = user.profile.id || user.id
    const asesorId = puedeAsignarAOtro ? body?.cliente?.asesorId : propioId

    const validado = validarClienteNuevo({ ...(body?.cliente ?? {}), asesorId })
    if (!validado.ok) {
      return NextResponse.json({ error: validado.errores.join(' '), errores: validado.errores }, { status: 400 })
    }
    const c = validado.valor

    const contactId = await encontrarOCrearContacto({
      nombre: c.nombre,
      telefono: c.telefono,
      email: c.email,
      origen: c.origen,
      asesorId: c.asesorId,
    })

    const dealId = await createDeal({
      contact_id: contactId,
      property_address: c.direccion,
      // La fecha de la visita es la que hace que el CRM lo muestre como
      // "Coordinada" y no como "Solicitud" (ver applyCRMStageFilter).
      scheduled_date: motivo === 'tasacion' ? c.fechaVisita : undefined,
      origin: c.origen,
      assigned_to: c.asesorId,
      created_by: propioId,
      property_type: c.tipo,
      property_type_other: c.tipoOtro,
      neighborhood: c.barrio,
      rooms: c.ambientes,
      stage: etapaInicial(motivo),
    })

    // Sin emails ni tareas: el trabajo ya lo hizo la persona que está cargando
    // esto. `debeNotificarCreacion` deja la decisión escrita y testeada.
    if (debeNotificarCreacion(motivo)) {
      console.warn('[deals/manual] notificación de creación pedida pero no implementada')
    }

    return NextResponse.json({ dealId })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
