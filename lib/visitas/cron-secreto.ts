/**
 * Validación y reemplazo seguro para `scripts/apply-cron-visit-reminders-pg.ts`.
 *
 * Módulo puro: sin red, sin base. Existe porque `sql.replaceAll('__SECRETO__', secreto)`
 * con un reemplazo de tipo STRING interpreta patrones especiales (`$&`, `$$`, `$'`, `` $` ``)
 * dentro del VALOR — si el secreto (o el dominio) contiene uno, el SQL generado queda
 * corrompido en silencio (p. ej. `$&` se expande al propio texto matcheado). La función de
 * reemplazo de abajo usa un replacer-función, que NO sufre esa interpretación.
 */

const PATRON_SECRETO = /^[A-Za-z0-9_-]+$/

/** Host sin esquema ni path: letras/dígitos/guiones por etiqueta, separadas por puntos. */
const PATRON_SITIO = /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$/

/**
 * Exige que el secreto sea un token "de cron" (alfanumérico + `_`/`-`), sin espacios,
 * comillas ni patrones de reemplazo. El mensaje de error NUNCA incluye el valor recibido.
 */
export function validarSecretoCron(secreto: string): void {
  if (!PATRON_SECRETO.test(secreto)) {
    throw new Error(
      'el secreto de cron_config no tiene la forma esperada (solo letras, números, "_" y "-"); no se imprime por seguridad'
    )
  }
}

/** Exige un host plano (`inmodf.com.ar`), sin `https://`, sin path y sin caracteres de inyección. */
export function validarSitioHttps(sitio: string): void {
  if (!PATRON_SITIO.test(sitio)) {
    throw new Error(`el dominio leído de cron.job no es un host https:// válido: "${sitio}"`)
  }
}

/**
 * Reemplaza TODAS las ocurrencias de `placeholder` por `valor`, sin interpretar patrones
 * especiales de reemplazo (`$&`, `$$`, ...) dentro de `valor`. Usar en vez de
 * `texto.replaceAll(placeholder, valor)` cuando `valor` viene de afuera (un secreto, un
 * dominio) y no se puede garantizar que esté libre de esos patrones.
 */
export function reemplazarPlaceholder(texto: string, placeholder: string, valor: string): string {
  return texto.replaceAll(placeholder, () => valor)
}
