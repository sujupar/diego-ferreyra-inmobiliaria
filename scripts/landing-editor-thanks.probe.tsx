/**
 * Probe de render estático de la PÁGINA DE GRACIAS en el editor:
 * ThanksPreview + ThanksPanel, y la página real compartiendo el mismo
 * componente. Verifica SIN navegador que lo editado se ve, que lo no editado
 * cae al default y que la vista previa no ofrece el formulario real.
 *
 * Correr: node --env-file=.env.local --import tsx scripts/landing-editor-thanks.probe.tsx
 */
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { ThanksPreview } from '@/components/landing/editor/ThanksPreview'
import { ThanksPanel } from '@/components/landing/editor/panels/ThanksPanel'
import type { LandingProperty } from '@/lib/landing/registry'

const property = {
  id: 'p1', title: 'Depto de prueba', property_type: 'departamento', address: 'Av. Cabildo 2450',
  neighborhood: 'Belgrano', city: 'CABA', operation_type: 'venta', asking_price: 250000, currency: 'USD',
  photos: ['https://x/0.jpg', 'https://x/1.jpg'],
  video_file_url: 'https://storage/x.mp4', video_url: null, video_recorrido_url: null,
  tour_3d_url: null, deliver_media: null, status: 'approved',
} as unknown as LandingProperty

// 1) Sin nada editado → los textos de siempre, con el {nombre} y la {direccion} reemplazados.
const base = renderToStaticMarkup(React.createElement(ThanksPreview, { property, thanks: {} }))
if (!base.includes('Hola Julián')) throw new Error('no reemplazó {nombre} en el saludo')
if (!base.includes('Conocé Av. Cabildo 2450 por dentro')) throw new Error('no reemplazó {direccion} en el titular')
if (!base.includes('¿Querés visitarla?')) throw new Error('falta el titular de agendar por defecto')
if (!base.includes('<video')) throw new Error('el video de archivo debería ir en un <video>, no en un iframe')
// La vista previa NO muestra el formulario real: no se agenda una visita desde el editor.
if (!base.includes('Acá va el formulario')) throw new Error('falta la maqueta del formulario')
if (base.includes('lx-editor-preview') === false) throw new Error('falta la clase que apaga las animaciones')

// 2) Editado → gana lo editado, y lo no tocado sigue en su default.
const editado = renderToStaticMarkup(
  React.createElement(ThanksPreview, {
    property,
    thanks: { headline: 'Mirala por dentro, {nombre}', intro: 'Cualquier duda, escribinos.' },
  }),
)
if (!editado.includes('Mirala por dentro, Julián')) throw new Error('no aplicó el titular editado')
if (!editado.includes('Cualquier duda, escribinos.')) throw new Error('no aplicó el párrafo nuevo')
if (!editado.includes('¿Querés visitarla?')) throw new Error('lo NO editado tendría que seguir en el default')

// 3) Un campo borrado vuelve al default (la página nunca queda sin titular).
const borrado = renderToStaticMarkup(
  React.createElement(ThanksPreview, { property, thanks: { headline: '   ' } }),
)
if (!borrado.includes('Conocé Av. Cabildo 2450 por dentro')) throw new Error('un titular vacío no volvió al default')

// 4) El panel muestra los 5 campos y explica los tokens.
const panel = renderToStaticMarkup(
  React.createElement(ThanksPanel, {
    value: {},
    subject: { address: 'Av. Cabildo 2450', mediaKind: 'video_propio' },
    onChange: () => {},
  }),
)
for (const t of ['Saludo', 'Titular', 'Párrafo bajo el precio', 'Bajada', '{nombre}', '{direccion}']) {
  if (!panel.includes(t)) throw new Error(`el panel no muestra "${t}"`)
}

console.log('✅ página de gracias: preview y panel OK (defaults, edición, borrado y tokens)')
