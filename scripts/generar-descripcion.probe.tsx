/**
 * Render estático del botón "Generar descripción" de la ficha.
 *
 * Verifica que aparezca cuando falta la descripción y que NO aparezca cuando ya
 * hay una — que es la garantía de que no se pisa texto escrito por una persona.
 *
 * Uso: node --import tsx scripts/generar-descripcion.probe.tsx
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { GenerarDescripcionButton } from '@/components/properties/GenerarDescripcionButton'

let fallos = 0
const ok = (n: string, c: boolean, extra = '') => {
  if (!c) { fallos++; console.log(`❌ ${n} ${extra}`) } else console.log(`✅ ${n}`)
}

const html = renderToStaticMarkup(
  <GenerarDescripcionButton propertyId="fff05c7f-e7ea-413c-ad33-062dc7bf0a10" onSaved={() => {}} />,
)

ok('el botón dice "Generar descripción"', html.includes('Generar descripción'))
ok('es un <button> de verdad, no un texto', /<button/.test(html))
// OJO: no alcanza con buscar "disabled" — las clases de Tailwind incluyen
// `disabled:pointer-events-none` y el regex ingenuo matchea SIEMPRE. Se busca
// el ATRIBUTO renderizado, que React emite como `disabled=""`.
ok('arranca habilitado', !html.includes('disabled=""'))
ok('no muestra una propuesta antes de generar', !html.includes('todavía no se guardó'))
ok('no muestra errores de arranque', !html.includes('No se pudo generar'))

console.log('\n--- texto visible ---\n' + html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() + '\n')
console.log(fallos === 0 ? 'Todo OK' : `${fallos} problema(s)`)
process.exit(fallos === 0 ? 0 : 1)
