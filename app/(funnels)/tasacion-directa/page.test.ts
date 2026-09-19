/**
 * Guardia del A/B por clic: la página de la landing NO puede volverse cacheable.
 *
 * El sorteo de la variante ocurre en el servidor, en cada pedido. Si alguien saca
 * el `force-dynamic` (o lo cambia "para que cargue más rápido"), Next o la CDN de
 * Netlify pueden guardar la página y TODOS los visitantes verían la variante que
 * salió en el primer pedido: el test quedaría 100/0 y NADA fallaría ni avisaría.
 * Un comentario "NO SACAR" no frena a nadie; esta prueba sí.
 *
 * Se lee el archivo como texto a propósito: importar la página arrastra
 * `server-only` y la conexión a la base.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

const fuente = readFileSync(join(__dirname, 'page.tsx'), 'utf8')
/** El código sin comentarios: que la frase viva en un comentario no cuenta. */
const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('/tasacion-directa — la página del A/B no se puede cachear', () => {
  it("declara `export const dynamic = 'force-dynamic'`", () => {
    expect(codigo).toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/)
  })

  it('no declara nada que la vuelva estática o la haga revalidar', () => {
    expect(codigo).not.toMatch(/export\s+const\s+revalidate\b/)
    expect(codigo).not.toMatch(/generateStaticParams/)
    expect(codigo).not.toMatch(/unstable_cache|['"]use cache['"]/)
  })

  it('sortea con `variantePorClic` en cada pedido, no con un valor guardado', () => {
    expect(codigo).toMatch(/variantePorClic\(/)
    expect(codigo).not.toMatch(/cookies\(\)/)
  })
})
