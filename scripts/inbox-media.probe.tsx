/**
 * Renderiza la burbuja del chat con casos REALES de la base y muestra el HTML,
 * para poder VER que una foto se dibuja como <img> y un plano como ficha con su
 * nombre — no como un link crudo.
 *
 * Existe porque los tests con DOM de este archivo necesitan un worker de vitest
 * con jsdom, y en esta máquina (Turbopack roto por el acento de la carpeta, ver
 * CLAUDE.md) conviene tener un camino de verificación que no dependa de eso.
 *
 * Uso: node --import tsx scripts/inbox-media.probe.tsx
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MessageBubble } from '@/components/inbox/MessageBubble'
import type { ThreadMessage } from '@/components/inbox/types'

const base: ThreadMessage = {
  id: '1', direction: 'out', body_preview: null, template_name: null, status: 'delivered',
  error_message: null, sent_by: null, created_at: new Date('2026-08-07T12:00:00Z').toISOString(),
  media_url: null, media_mime_type: null, media_filename: null, media_type: null,
} as ThreadMessage

const CASOS: Array<{ nombre: string; msg: ThreadMessage; espera: RegExp }> = [
  {
    nombre: 'Foto que mandó el sistema (media_type sin mime) → <img>',
    msg: { ...base, media_type: 'image', media_url: 'https://imgar.zonapropcdn.com/a/2052942732.jpg',
           body_preview: '[Foto] https://imgar.zonapropcdn.com/a/2052942732.jpg' },
    espera: /<img[^>]+src="https:\/\/imgar\.zonapropcdn\.com\/a\/2052942732\.jpg"/,
  },
  {
    nombre: 'Video → <video controls>',
    msg: { ...base, media_type: 'video', media_url: 'https://s.co/v/casa.mp4' },
    espera: /<video[^>]+controls/,
  },
  {
    nombre: 'Plano → ficha con el nombre de la propiedad',
    msg: { ...base, media_type: 'document', media_url: 'https://s.co/p/plano.pdf',
           media_filename: 'Entre Ríos 2333, Martínez, San Isidro - Planos.pdf' },
    espera: /Entre Ríos 2333, Martínez, San Isidro - Planos\.pdf/,
  },
  {
    nombre: 'HISTORIAL: mensaje viejo sin columnas → igual se dibuja la foto',
    msg: { ...base, body_preview: '[Foto] https://imgar.zonapropcdn.com/a/2052942705.jpg' },
    espera: /<img[^>]+src="https:\/\/imgar\.zonapropcdn\.com\/a\/2052942705\.jpg"/,
  },
  {
    nombre: 'Texto normal → sigue siendo texto',
    msg: { ...base, body_preview: 'Hola Diego, ¿cómo estás?' },
    espera: /Hola Diego/,
  },
  {
    nombre: 'Nota interna del agente → NO se confunde con un archivo',
    msg: { ...base, status: 'agent_handoff', body_preview: '[Agente IA] Julian apagó el agente' },
    espera: /Nota interna del equipo/,
  },
]

let fallos = 0
for (const c of CASOS) {
  const html = renderToStaticMarkup(<MessageBubble message={c.msg} />)
  const ok = c.espera.test(html)
  if (!ok) fallos++
  console.log(`${ok ? '✅' : '❌'} ${c.nombre}`)
  if (!ok) console.log(`   esperaba ${c.espera}\n   salió: ${html.slice(0, 400)}\n`)
  // Lo que NO puede aparecer nunca más: una URL suelta como texto visible.
  const urlSuelta = />\s*https?:\/\/[^<]{20,}</.test(html)
  if (urlSuelta) { fallos++; console.log(`   ❌ quedó una URL cruda visible en pantalla`) }
}
console.log(fallos === 0 ? '\nTodo OK' : `\n${fallos} problema(s)`)
process.exit(fallos === 0 ? 0 : 1)
