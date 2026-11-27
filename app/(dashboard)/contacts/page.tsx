import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth/get-user'
import { alcanceContactos } from '@/lib/auth/contact-access'
import { cargarContactos, type DatosContactos } from '@/lib/supabase/cartera'
import { ContactosLista } from '@/components/crm/cartera/ContactosLista'
import { SinAccesoLista } from '@/components/crm/cartera/SinAcceso'

// Contactos (crm-cartera-por-rol, D6). Componente de SERVIDOR: decide quién ve a quién con
// la regla de la ficha (`cargarContactos` → `contactoVisible`), lee con el MISMO servicio que
// `/api/crm/contactos` y le pasa a `ContactosLista` SOLO datos planos. El abogado, que antes
// veía la pantalla vacía con un 403 de la API, ahora va a su pantalla.

export const dynamic = 'force-dynamic'

export default async function ContactosPage() {
  const user = await getUser()
  if (!user) redirect('/login')
  const quien = { id: user.id, role: user.profile.role }
  if (quien.role === 'abogado') redirect('/properties/review')
  const alcance = alcanceContactos(quien.role)
  if (!user.profile.is_active || alcance === 'ninguno') return <SinAccesoLista titulo="No tenés acceso a Contactos" />

  let inicial: DatosContactos | null = null
  try {
    inicial = await cargarContactos(quien, new Date())
  } catch (e) {
    console.error('[/contacts] no se pudo leer la lista', e)
  }
  return <ContactosLista inicial={inicial} propios={alcance === 'propios'} />
}
