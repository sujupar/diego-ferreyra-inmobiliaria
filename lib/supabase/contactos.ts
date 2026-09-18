import { createClient } from '@supabase/supabase-js'
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export interface DatosContacto {
  nombre: string
  telefono?: string | null
  email?: string | null
  origen?: string | null
  asesorId?: string | null
}

/**
 * Encuentra el contacto por email o por teléfono, y si no existe lo crea.
 *
 * El teléfono se compara por los ÚLTIMOS 10 DÍGITOS (`phone_norm`), no por
 * igualdad exacta: el mismo número aparece como "11 5555-4444", "+5491155554444"
 * o "+541155554444" según quién lo cargó, y comparar el texto creaba un contacto
 * nuevo por cada formato. Es la misma regla que usa "Coordinar Tasación"
 * (`app/api/deals/route.ts`); si se cambia una, se cambian las dos.
 */
export async function encontrarOCrearContacto(datos: DatosContacto): Promise<string> {
  const supabase = getAdmin()
  const email = (datos.email ?? '').trim().toLowerCase()
  const telefono = (datos.telefono ?? '').trim()

  if (email) {
    const { data } = await supabase.from('contacts').select('id').eq('email', email).maybeSingle()
    if (data?.id) return data.id as string
  }

  const clave = ultimos10Digitos(telefono)
  if (clave) {
    const { data } = await supabase
      .from('contacts').select('id').eq('phone_norm', clave)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (data?.id) return data.id as string
  }

  const { data: nuevo, error } = await supabase
    .from('contacts')
    .insert({
      full_name: datos.nombre,
      phone: telefono || null,
      email: email || null,
      origin: datos.origen || null,
      assigned_to: datos.asesorId || null,
    })
    .select('id')
    .single()
  if (error) throw error
  return nuevo.id as string
}
