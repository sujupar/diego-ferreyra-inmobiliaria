/**
 * Quién está del otro lado, leído de la sesión SIN viajar a Supabase (spec
 * docs/superpowers/specs/2026-10-29-sesion-rapida-design.md).
 *
 * Por qué `getClaims` y no `getUser`: `getUser` le pregunta al servidor de
 * Supabase en cada pedido (~0,17 s), y se llamaba dos o tres veces por pedido.
 * `getClaims` verifica la firma del token con la clave pública del proyecto,
 * que se descarga una vez y queda en memoria 10 minutos.
 *
 * OJO: eso vale SOLO si el proyecto firma con claves asimétricas. Con la clave
 * compartida vieja (HS256) `getClaims` vuelve a llamar a `getUser` por dentro:
 * es seguro, pero no es más rápido. Ver CLAUDE.md § "Sesión sin viaje".
 *
 * Lo que se pierde (decisión del dueño, 2026-10-29): una sesión cerrada desde
 * OTRO dispositivo sigue valiendo hasta que vence su token (1 hora). Desactivar
 * a alguien o cambiarle el rol sigue siendo inmediato: eso sale del perfil, que
 * `getUser` de get-user.ts lee en cada pedido.
 */

type Claims = Record<string, unknown>

/** Lo mínimo del cliente de Supabase que hace falta (y que se puede simular). */
export interface ClienteConSesion {
  auth: {
    getClaims(): Promise<{ data: { claims: Claims } | null; error: unknown }>
  }
}

export interface Sesion {
  id: string
  email: string
}

export async function leerSesion(supabase: ClienteConSesion): Promise<Sesion | null> {
  try {
    const { data, error } = await supabase.auth.getClaims()
    if (error || !data) return null
    const { sub, email } = data.claims
    // Un token de la clave `anon` también es un token firmado válido, pero sin
    // `sub`: no es una persona logueada.
    if (typeof sub !== 'string' || sub === '') return null
    return { id: sub, email: typeof email === 'string' ? email : '' }
  } catch (err) {
    // Red caída, respuesta rara: ante la duda, sin sesión (al login), nunca adentro.
    console.warn('[sesion] no se pudo validar la sesión:', err instanceof Error ? err.message : err)
    return null
  }
}
