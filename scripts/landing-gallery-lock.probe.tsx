/**
 * Verificación de la puerta de registro de la galería SIN navegador.
 *
 * Por qué existe: los tests de componente (happy-dom) no arrancan en este host
 * — el worker de vitest se cuelga incluso con los tests que ya existían — y
 * Turbopack tampoco levanta por el acento del path. Este probe renderiza el
 * componente de verdad con renderToStaticMarkup (mismo patrón que el resto del
 * repo) y afirma sobre el HTML resultante.
 *
 * Sin provider, useLeadCapture() devuelve el fallback { unlocked: false } → es
 * exactamente el estado BLOQUEADO, que es el camino nuevo a verificar.
 *
 * Uso: node --import tsx scripts/landing-gallery-lock.probe.tsx
 */
import React from 'react' // tsx compila JSX a React.createElement (sin jsx runtime acá)
import { renderToStaticMarkup } from 'react-dom/server'
import { GalleryLightbox } from '../components/landing/luxury/GalleryLightbox'

const images = Array.from({ length: 12 }, (_, i) => ({ src: `https://cdn.test/foto-${i}.jpg` }))

let fallos = 0
function check(nombre: string, ok: boolean, detalle = '') {
  console.log(`${ok ? '✅' : '❌'} ${nombre}${ok ? '' : ` — ${detalle}`}`)
  if (!ok) fallos++
}

// ── Caso 1: 12 fotos, visitante SIN registrar ───────────────────────────────
const html = renderToStaticMarkup(<GalleryLightbox images={images} eyebrow="La propiedad" title="Recorré cada rincón" />)

const ampliables = (html.match(/aria-label="Ampliar foto/g) ?? []).length
const bloqueadas = (html.match(/registrate para verla/g) ?? []).length

check('muestra exactamente 3 fotos libres', ampliables === 3, `encontradas ${ampliables}`)
check('adelanta 6 fotos bloqueadas (intriga)', bloqueadas === 6, `encontradas ${bloqueadas}`)
check('las bloqueadas van borrosas (blur)', html.includes('blur-lg'))
check('las bloqueadas llevan candado + "Ver más"', html.includes('Ver más'))
check('dice cuántas faltan (9 de 12)', html.includes('9 fotos'), 'no aparece el conteo')
check('invita a registrarse', html.includes('Ver todas las fotos'))
check('aclara que se ven al instante', html.includes('Dejanos tus datos y las ves al instante'))

// Las URLs de las bloqueadas SÍ están en el HTML (es una puerta comercial, no de
// seguridad) — pero NO deben ser ampliables ni navegables desde el lightbox.
check(
  'ninguna foto bloqueada es ampliable',
  !new RegExp(`aria-label="Ampliar foto (4|5|6|7|8|9|10|11|12)`).test(html),
)

// ── Caso 2: 3 fotos o menos → no hay nada que bloquear ──────────────────────
const html3 = renderToStaticMarkup(<GalleryLightbox images={images.slice(0, 3)} />)
check('con 3 fotos no bloquea nada', !html3.includes('registrate para verla'))
check('con 3 fotos no pide registro', !html3.includes('Ver todas las fotos'))

// ── Caso 3: sin fotos → no renderiza ────────────────────────────────────────
check('sin fotos no rompe', renderToStaticMarkup(<GalleryLightbox images={[]} />) === '')

// ── Caso 4: el texto visible está en rioplatense ────────────────────────────
const textoVisible = html.replace(/<[^>]+>/g, ' ')
const tuteo = [/\btú\b/i, /\btienes\b/i, /\bpuedes\b/i, /\bquieres\b/i, /\bregístrate\b/i, /\bdéjanos\b/i]
const hallazgo = tuteo.find(re => re.test(textoVisible))
check('el copy visible está en voseo (sin tuteo)', !hallazgo, `aparece "${hallazgo}"`)

console.log(fallos === 0 ? '\n🎉 Todo OK' : `\n${fallos} verificación(es) fallaron`)
process.exit(fallos === 0 ? 0 : 1)
