/**
 * ¿Quien abre el enlace es alguien del equipo? (auditoría 2, hallazgo 4). Puro.
 *
 * Si Paula copia el enlace de Ana desde la ficha y lo abre para revisarlo, no puede sumarle
 * aperturas ni minutos a Ana. `/t/` vive en el mismo dominio que la plataforma, así que el
 * navegador del equipo manda sus cookies de sesión.
 *
 * Alcanza con que EXISTA la cookie de sesión de Supabase (`sb-<proyecto>-auth-token`, a veces
 * partida en `.0`, `.1`), aunque esté vencida: `/t/` no pasa por el refresco de sesión del
 * middleware, y una sesión vencida de alguien del equipo sigue siendo alguien del equipo. Un
 * cliente que llega desde WhatsApp nunca tiene esa cookie.
 */
const COOKIE_DE_SESION = /^sb-[a-z0-9]+-auth-token(\.\d+)?$/

export function esVisitaDelEquipo(e: { haySesionValida: boolean; nombresDeCookies: string[] }): boolean {
  return e.haySesionValida || e.nombresDeCookies.some((n) => COOKIE_DE_SESION.test(n))
}
