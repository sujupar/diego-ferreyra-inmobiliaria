/**
 * Verifica el formulario de agenda sin navegador (happy-dom no arranca en este
 * host). Renderiza el client component y afirma sobre el HTML.
 *
 * Uso: node --import tsx scripts/landing-access-token.probe.tsx
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ScheduleVisitForm } from '../app/v/[token]/ScheduleVisitForm'

let fallos = 0
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '✅' : '❌'} ${n}${ok ? '' : ` — ${d}`}`)
  if (!ok) fallos++
}

const html = renderToStaticMarkup(<ScheduleVisitForm token="Abc23Xyz99" clientName="Juan Pérez" />)

check('pide día', html.includes('type="date"'))
check('ofrece las 3 franjas', ['mañana', 'mediodía', 'tarde'].every(f => html.toLowerCase().includes(f)))
check('NO pide nombre/email/teléfono (ya vienen en el token)',
  !/name="(nombre|name|email|phone|telefono)"/i.test(html))
check('el botón dice Agendar visita', html.includes('Agendar visita'))
check('está en voseo', /Eleg[íi]|Agend[áa]/.test(html) && !/\b(elige|puedes|tienes)\b/i.test(html))

console.log(fallos === 0 ? '\n🎉 Todo OK' : `\n${fallos} fallaron`)
process.exit(fallos === 0 ? 0 : 1)
