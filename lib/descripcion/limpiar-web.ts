/**
 * Saneo del texto que devuelve la búsqueda web antes de guardarlo y de pasarlo
 * al prompt de escritura.
 *
 * La búsqueda cita sus fuentes como links markdown con `?utm_source=openai`.
 * Los links no le sirven al redactor (y una URL en una descripción de portal es
 * motivo de rechazo), las « » cerrarían el delimitador de DATO, y el markdown
 * se colaría en el texto final. Es contenido de terceros: se trata como hostil.
 */
export function limpiarTextoWeb(t: string, max = 1500): string {
  return t
    // "([zonaprop.com.ar](https://…))" es una cita de fuente: se va entera.
    .replace(/\s*\(\[[^\]]*\]\([^)]*\)\)/g, '')
    // "[Wikipedia](https://…)" dentro de una frase: queda el texto.
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[«»]/g, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .slice(0, max)
}
