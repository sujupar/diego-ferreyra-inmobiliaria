import { NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import { alcanceContactos } from '@/lib/auth/contact-access'
import { cargarContactos } from '@/lib/supabase/cartera'

/**
 * Contactos con la misma fila que el CRM (design.md D6). Service role: la ruta es la ÚNICA
 * barrera. No recibe ningún parámetro (los filtros van en memoria): nada de la dirección
 * puede ensanchar lo que un rol ve. El asesor recibe solo los contactos que deja la regla de
 * la ficha, y el próximo paso con solo sus tareas (lo recorta `cargarContactos`).
 * Sesión con `getUser`: `requireAuth` redirige y el `fetch` recibiría HTML con un 200.
 */
export const dynamic = 'force-dynamic'

function error(status: number, mensaje: string) {
  return NextResponse.json({ error: mensaje }, { status })
}

// Sin parámetro a propósito: la ruta ni recibe la dirección, así nada de ella cambia la respuesta.
export async function GET() {
  const user = await getUser()
  if (!user || !user.profile.is_active) return error(401, 'Iniciá sesión de nuevo.')
  const usuario = { id: user.id, role: user.profile.role }
  if (alcanceContactos(usuario.role) === 'ninguno') return error(403, 'No tenés acceso a los contactos.')
  try {
    const datos = await cargarContactos(usuario, new Date())
    if (!datos) return error(403, 'No tenés acceso a los contactos.')
    return NextResponse.json(datos)
  } catch (e) {
    console.error('[GET /api/crm/contactos]', e)
    return error(500, 'No se pudo cargar la lista de contactos.')
  }
}
