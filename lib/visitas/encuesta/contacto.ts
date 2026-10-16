/**
 * El teléfono que muestra la página pública: enmascarado ("11 ••••-4521"). Quien tiene el link no
 * tiene por qué ver el número entero (spec §4.10). Puro y seguro para el navegador.
 */
export function enmascararTelefono(t: string | null | undefined): string | null {
  const d = (t ?? '').replace(/\D/g, '')
  if (d.length < 8) return null
  if (d.length < 10) return `••••-${d.slice(-4)}`
  const diez = d.slice(-10)
  return `${diez.slice(0, 2)} ••••-${diez.slice(-4)}`
}

const PATRON_EMAIL = /[^\s@]+@([^\s@]+\.[^\s@]+)/g

/**
 * Los errores de Resend (p. ej. "send failed to ana@mail.com: ...") pueden traer el email entero.
 * Se guardan en `notice_error` (una columna de texto libre, sin RLS de ocultamiento) y se logean en
 * la consola de Netlify: ninguno de los dos lugares debería tener el email completo de un cliente.
 */
export function ocultarEmailsEnTexto(texto: string): string {
  return texto.replace(PATRON_EMAIL, (_m, dominio: string) => `***@${dominio}`)
}
