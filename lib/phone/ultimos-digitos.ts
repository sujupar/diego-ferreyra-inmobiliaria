/**
 * La clave canónica de un teléfono en este sistema: sus ÚLTIMOS 10 DÍGITOS.
 *
 * ## Por qué existe (2026-08-16, caso Daniel Lapadula)
 *
 * El mismo número vive en la base en TRES formatos, según por dónde entró:
 *
 *   '+5491149372737'   — E.164 móvil (el formulario del embudo, WhatsApp)
 *   '+541149372737'    — E.164 fijo/sin el 9 (importaciones viejas, GHL)
 *   '1149372737'       — pelado, como lo tipeó alguien (CSV histórico)
 *
 * Un cliente real se registró, tocó "Coordinar por acá" y el agente NO le
 * contestó: buscaba el contacto por igualdad exacta con el formato de
 * WhatsApp (con 9) y el contacto estaba guardado sin 9. El "9" argentino
 * hace que la igualdad exacta entre formatos sea imposible de sostener.
 *
 * Los últimos 10 dígitos (área + número: '1149372737') son idénticos en los
 * tres formatos — inmunes al +54, al 9, a espacios y guiones. Verificado
 * contra la base real: las únicas colisiones eran la MISMA persona duplicada
 * por el matcheo exacto anterior.
 *
 * En Postgres, la misma regla vive en la columna generada `contacts.phone_norm`
 * (migración 20260816000001) — mantener las dos definiciones IGUALES.
 */
export function ultimos10Digitos(telefono: string | null | undefined): string | null {
  const digitos = (telefono ?? '').replace(/\D/g, '')
  // Menos de 10 dígitos no identifica un teléfono argentino completo (área +
  // número). Antes que arriesgar un falso positivo, no se matchea.
  if (digitos.length < 10) return null
  return digitos.slice(-10)
}

/** ¿Estos dos teléfonos son el mismo número, sin importar el formato? */
export function mismoTelefono(a: string | null | undefined, b: string | null | undefined): boolean {
  const la = ultimos10Digitos(a)
  return la !== null && la === ultimos10Digitos(b)
}
