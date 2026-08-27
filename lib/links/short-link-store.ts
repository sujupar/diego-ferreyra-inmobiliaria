/**
 * Guardar y resolver links cortos. La lógica sin base de datos —y las reglas de
 * seguridad— viven en `./short-link`, que se testea sola.
 */
import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { generarCodigo, urlCorta, esDestinoPermitido } from './short-link'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * Acorta una URL de WhatsApp. **NUNCA lanza y nunca bloquea**: si algo falla
 * devuelve `null` y el que llama se queda con la URL larga, que funciona igual.
 * Perder el aviso de una consulta por no poder acortar un link sería absurdo.
 *
 * Reintenta una vez ante choque de código (probabilidad ínfima, pero un choque
 * silencioso reescribiría el destino de OTRO link — y ahí el asesor le escribe a
 * la persona equivocada).
 */
export async function acortar(target: string, source = 'portal_inquiry'): Promise<string | null> {
  if (!esDestinoPermitido(target)) {
    console.warn('[short-link] destino no permitido, no se acorta:', target.slice(0, 60))
    return null
  }
  for (let intento = 0; intento < 2; intento++) {
    try {
      const code = generarCodigo()
      const { error } = await admin().from('short_links').insert({ code, target_url: target, source })
      if (!error) return urlCorta(code)
      // 23505 = unique_violation: el código ya existía. Se reintenta con otro.
      if (error.code !== '23505') {
        console.warn('[short-link] no se pudo acortar (sigue el link largo):', error.message)
        return null
      }
    } catch (err) {
      console.warn('[short-link] excepción acortando (sigue el link largo):', err)
      return null
    }
  }
  return null
}

/** El destino de un código, o `null` si no existe. */
export async function resolver(code: string): Promise<string | null> {
  try {
    const { data } = await admin()
      .from('short_links')
      .select('target_url')
      .eq('code', code)
      .maybeSingle()
    const target = (data as { target_url: string } | null)?.target_url ?? null
    // Se revalida al SERVIR, no solo al crear: si una fila entrara por otro
    // camino, acá no se convierte en un redirector a cualquier lado.
    return target && esDestinoPermitido(target) ? target : null
  } catch {
    return null
  }
}

/** Suma una visita. Best-effort: que falle el contador no puede romper el redirect. */
export async function contarVisita(code: string): Promise<void> {
  try {
    const sb = admin()
    const { data } = await sb.from('short_links').select('hits').eq('code', code).maybeSingle()
    const hits = ((data as { hits: number } | null)?.hits ?? 0) + 1
    await sb.from('short_links').update({ hits, last_hit_at: new Date().toISOString() }).eq('code', code)
  } catch {
    // Nada: el asesor ya está yendo al chat.
  }
}
