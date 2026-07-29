/**
 * Probe: la promesa del recorrido se adapta cuando la propiedad NO tiene ninguno.
 *
 * Verifica que el email al cliente NO diga "recorrido" cuando `hasRecorrido:false`
 * (y sí lo diga cuando lo hay). El candado de publicación vive en el servidor
 * (`assertRecorridoDisponible`) y se prueba contra Supabase, no acá.
 *
 * Correr (el shim de `server-only` es necesario fuera de Next):
 *   mkdir -p /tmp/shim/node_modules/server-only
 *   echo '{"name":"server-only","main":"index.js"}' > /tmp/shim/node_modules/server-only/package.json
 *   echo 'module.exports={}' > /tmp/shim/node_modules/server-only/index.js
 *   NODE_PATH=/tmp/shim/node_modules node --env-file=.env.local --import tsx \
 *     scripts/recorrido-sin-recorrido.probe.tsx
 */
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { RecorridoLinkClientEmail } from '@/emails/RecorridoLinkClientEmail'

const base = {
  clientName: 'Martín Gómez',
  propertyLabel: 'el departamento de 3 ambientes en Villa Devoto',
  accessUrl: 'https://inmodf.com.ar/v/Abc23Xyz99',
}

let fallos = 0
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? '✅' : '❌'} ${msg}`)
  if (!ok) fallos++
}

const conRecorrido = renderToStaticMarkup(
  React.createElement(RecorridoLinkClientEmail, { ...base, hasRecorrido: true }) as never,
)
check(/recorrido de <strong>|recorrido de |Tu recorrido por/i.test(conRecorrido), 'con recorrido: promete el recorrido')
check(conRecorrido.includes('Ver el recorrido'), 'con recorrido: el botón dice "Ver el recorrido"')

const sinRecorrido = renderToStaticMarkup(
  React.createElement(RecorridoLinkClientEmail, { ...base, hasRecorrido: false }) as never,
)
check(!/recorrido/i.test(sinRecorrido), 'sin recorrido: la palabra "recorrido" NO aparece en ningún lado')
check(sinRecorrido.includes('fotos completas'), 'sin recorrido: ofrece las fotos completas')
check(sinRecorrido.includes('Ver la propiedad'), 'sin recorrido: el botón dice "Ver la propiedad"')
check(sinRecorrido.includes('proponer el día'), 'sin recorrido: sigue invitando a agendar la visita')
check(sinRecorrido.includes(base.accessUrl), 'sin recorrido: el link se entrega igual')

// Sin el prop (llamadores viejos) NO se degrada el texto.
const porDefecto = renderToStaticMarkup(
  React.createElement(RecorridoLinkClientEmail, base) as never,
)
check(porDefecto === conRecorrido, 'sin el prop: se comporta como "sí hay recorrido"')

console.log(fallos === 0 ? '\nTodo OK' : `\n${fallos} fallo(s)`)
process.exit(fallos === 0 ? 0 : 1)
