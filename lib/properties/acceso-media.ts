/**
 * ¿Este usuario puede subir/gestionar el MATERIAL (fotos, planos, video) de
 * esta propiedad?
 *
 * Es `canAccessProperty` (anti-IDOR: un asesor solo toca sus filas) MÁS una
 * excepción acotada: **quien capta la propiedad puede subir su material aunque
 * la muestre otro asesor**.
 *
 * Por qué hace falta: el alta EXIGE elegir "quién muestra la propiedad" de un
 * desplegable que ofrece a los demás asesores, y el POST guarda ese elegido en
 * `assigned_to`. Entonces un asesor que carga una propiedad y la asigna a su
 * compañero —el caso que el propio formulario empuja— recibía 403 al subir los
 * planos que acababa de adjuntar, con un mensaje de recuperación FALSO ("podés
 * subirlos desde la ficha": misma ruta, mismo 403). Lo mismo con las fotos y el
 * video desde la ficha.
 *
 * Alcance de la excepción, a propósito angosto:
 *  - solo `properties`, y solo para el material (no habilita editar la ficha,
 *    ni la revisión legal, ni el estado comercial, ni ver propiedades ajenas);
 *  - `created_by` es inmutable después del alta (ninguna ruta lo actualiza), y
 *    en el alta solo se puede escribir el propio id o el de otro — o sea que
 *    nadie se puede auto-conceder acceso a una propiedad existente;
 *  - la consulta extra corre SOLO cuando el guard normal dijo que no.
 *
 * Es el mismo criterio de propiedad que ya usa la RLS de `deals` y `contacts`
 * (`assigned_to = auth.uid() OR created_by = auth.uid()`).
 */

import { createClient } from '@supabase/supabase-js'
import type { UserWithProfile } from '@/types/auth.types'
import { canAccessProperty } from '@/lib/auth/entity-access'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function puedeGestionarMedia(user: UserWithProfile, propertyId: string): Promise<boolean> {
  if (await canAccessProperty(user, propertyId)) return true

  const { data } = await admin()
    .from('properties')
    .select('created_by')
    .eq('id', propertyId)
    .maybeSingle()
  // Falla cerrado: fila inexistente o lectura fallida → no.
  if (!data) return false
  return (data as { created_by: string | null }).created_by === user.id
}
