import { createClient } from '@supabase/supabase-js'
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'
import { textoNotaDeVinculo } from '@/lib/crm/actividades'

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
    // `limit(1)`: el email no es único en la base; con dos contactos iguales,
    // `maybeSingle` sin límite daba error y se creaba un TERCERO.
    const { data } = await supabase.from('contacts').select('id').eq('email', email).limit(1).maybeSingle()
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

/**
 * Guarda nombre, teléfono y email ya validados en UN contacto conocido (coordinar desde
 * la ficha, crm-ficha-y-llamadas D9 paso 5). No busca ni crea a nadie: el contacto es el
 * del proceso (o el que mandó la ficha). LANZA si la base devuelve error.
 */
export async function guardarDatosDeContacto(
  contactId: string,
  datos: { full_name: string; phone: string; email: string },
): Promise<void> {
  const { error } = await getAdmin().from('contacts').update(datos).eq('id', contactId)
  if (error) throw new Error(`guardarDatosDeContacto: ${error.message}`)
}

/**
 * ¿Hay OTRO contacto con ese email (tal cual o en minúsculas) o con ese teléfono (por
 * los últimos 10 dígitos, `phone_norm`)? Es la misma búsqueda de "Coordinar tasación",
 * excluyendo al contacto que se está corrigiendo. Solo se usa para avisar: no se unifica
 * ni se bloquea nada (D9, Risks).
 */
export async function hayOtroContactoCon(
  contactId: string,
  datos: { emails: string[]; telefono: string },
): Promise<boolean> {
  const supabase = getAdmin()
  const emails = [...new Set(datos.emails.map((e) => e.trim()).filter(Boolean))]
  if (emails.length > 0) {
    const { data, error } = await supabase
      .from('contacts').select('id').in('email', emails).neq('id', contactId).limit(1).maybeSingle()
    if (error) throw new Error(`hayOtroContactoCon (email): ${error.message}`)
    if (data) return true
  }
  const clave = ultimos10Digitos(datos.telefono)
  if (!clave) return false
  const { data, error } = await supabase
    .from('contacts').select('id').eq('phone_norm', clave).neq('id', contactId).limit(1).maybeSingle()
  if (error) throw new Error(`hayOtroContactoCon (teléfono): ${error.message}`)
  return !!data
}

/**
 * Deja en la ficha del contacto el rastro de que un asesor lo vinculó a su proceso al
 * completar los datos del cliente, cuando antes no podía ver a esa persona
 * (`PUT /api/deals/[id]/cliente`, crm-ficha-y-llamadas D4). Es la única nota que no
 * escribe una persona: va con `automatic = true`, y por eso el asesor que figura como
 * autor no la puede editar ni borrar. Sin `occurred_at` (lo pone la base) ni
 * `client_token`. LANZA si la base devuelve error: supabase-js no lanza solo.
 */
export async function registrarNotaDeVinculo(datos: {
  contactId: string
  dealId: string
  autorId: string
  direccion: string | null
}): Promise<void> {
  const { error } = await getAdmin()
    .from('contact_activities')
    .insert({
      contact_id: datos.contactId,
      deal_id: datos.dealId,
      created_by: datos.autorId,
      kind: 'note',
      automatic: true,
      body: textoNotaDeVinculo(datos.direccion),
    })
  if (error) throw new Error(`registrarNotaDeVinculo: ${error.message}`)
}
