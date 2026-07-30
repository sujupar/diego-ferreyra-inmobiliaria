/**
 * Verificación SIN navegador de la papelera del Inbox (Task 8).
 *
 * Por qué existe: los tests de componente (happy-dom) no arrancan en este
 * host y Turbopack tampoco levanta (acento en el path del proyecto — ver
 * CLAUDE.md). Este probe renderiza `InboxClient` de verdad con
 * `renderToStaticMarkup` (mismo patrón que `scripts/landing-gallery-lock.probe.tsx`)
 * y afirma sobre el HTML resultante.
 *
 * Alcance de lo que ESTE probe puede verificar: `InboxClient` dispara su fetch
 * inicial en un `useEffect`, que React NO ejecuta durante un render estático
 * (solo corre en el commit del navegador) — así que acá no hay red real y el
 * componente queda montado en su estado inicial (`loading=true`, `leads=null`).
 * Lo que SÍ es 100% verificable en ese estado inicial, porque no depende de
 * datos cargados: el gating por rol de la Papelera (el toggle "Papelera" y su
 * texto de ayuda son parte del header, que se renderiza sin esperar al fetch).
 * La lista de leads, los checkboxes por fila y la barra de acciones en vivo
 * SOLO se probaron contra la base real (`scripts/leads-papelera.probe.ts`) y
 * deben confirmarse en un navegador — no acá.
 *
 * Uso: node --env-file=.env.local --import tsx scripts/inbox-papelera.probe.tsx
 */
import React from 'react' // tsx compila JSX a React.createElement (sin jsx runtime acá)
import { renderToStaticMarkup } from 'react-dom/server'
import { InboxClient } from '../app/(dashboard)/inbox/InboxClient'

let fallos = 0
function check(nombre: string, ok: boolean, detalle = '') {
  console.log(`${ok ? '✅' : '❌'} ${nombre}${ok ? '' : ` — ${detalle}`}`)
  if (!ok) fallos++
}

// ── Caso 1: admin ve el toggle de Papelera ──────────────────────────────────
const htmlAdmin = renderToStaticMarkup(<InboxClient userRole="admin" userId="u-admin" />)
check('admin ve el botón "Papelera"', htmlAdmin.includes('Papelera'))
check('admin ve el botón "Leads" (vista activa)', htmlAdmin.includes('>Leads<'))

// ── Caso 2: dueno y coordinador también (roles de operaciones) ─────────────
const htmlDueno = renderToStaticMarkup(<InboxClient userRole="dueno" userId="u-dueno" />)
check('dueño ve el botón "Papelera"', htmlDueno.includes('Papelera'))
const htmlCoord = renderToStaticMarkup(<InboxClient userRole="coordinador" userId="u-coord" />)
check('coordinador ve el botón "Papelera"', htmlCoord.includes('Papelera'))

// ── Caso 3: asesor NO ve la Papelera (no puede borrar ni restaurar) ────────
const htmlAsesor = renderToStaticMarkup(<InboxClient userRole="asesor" userId="u-asesor" />)
check('asesor NO ve el botón "Papelera"', !htmlAsesor.includes('Papelera'))
check('asesor sigue viendo el texto normal del Inbox', htmlAsesor.includes('Leads de tus propiedades'))

// ── Caso 4: el copy es rioplatense (voseo), sin tuteo ──────────────────────
const textoVisible = htmlAdmin.replace(/<[^>]+>/g, ' ')
const tuteo = [/\btú\b/i, /\btienes\b/i, /\bpuedes\b/i, /\bquieres\b/i, /\belimínalos\b/i]
const hallazgo = tuteo.find(re => re.test(textoVisible))
check('el copy visible está en voseo (sin tuteo)', !hallazgo, `aparece "${hallazgo}"`)

// ── Caso 5: estado inicial no rompe (loading, sin leads todavía) ──────────
check('el estado inicial (cargando) no rompe el render', htmlAdmin.includes('animate-spin'))

console.log(fallos === 0 ? '\n🎉 Todo OK' : `\n${fallos} verificación(es) fallaron`)
process.exit(fallos === 0 ? 0 : 1)
