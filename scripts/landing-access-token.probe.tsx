/**
 * Verifica el formulario de agenda y el embed de video sin navegador (happy-dom
 * no arranca en este host). Renderiza componentes con `renderToStaticMarkup` y
 * afirma sobre el HTML.
 *
 * Uso: node --import tsx scripts/landing-access-token.probe.tsx
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ScheduleVisitForm } from '../app/v/[token]/ScheduleVisitForm'
import { toEmbedUrl } from '../lib/landing/video-embed'

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

// ── Embed de video: misma rama condicional que `app/v/[token]/page.tsx` ──────
function VideoSection({ url }: { url: string }) {
  const embed = toEmbedUrl(url)
  return embed
    ? <iframe src={embed} title="Video recorrido" />
    : <video src={url} controls playsInline />
}

const vimeoHtml = renderToStaticMarkup(<VideoSection url="https://vimeo.com/76979871" />)
check('Vimeo produce un iframe de player.vimeo.com',
  /<iframe[^>]+src="https:\/\/player\.vimeo\.com\/video\/76979871"/.test(vimeoHtml), vimeoHtml)

const youtubeHtml = renderToStaticMarkup(<VideoSection url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />)
check('YouTube produce un iframe de youtube.com/embed',
  /<iframe[^>]+src="https:\/\/www\.youtube\.com\/embed\/dQw4w9WgXcQ"/.test(youtubeHtml), youtubeHtml)

const fileHtml = renderToStaticMarkup(<VideoSection url="https://cdn.test/video.mp4" />)
check('URL de archivo (no youtube/vimeo) cae a <video>',
  /<video[^>]+src="https:\/\/cdn\.test\/video\.mp4"/.test(fileHtml), fileHtml)

console.log(fallos === 0 ? '\n🎉 Todo OK' : `\n${fallos} fallaron`)
process.exit(fallos === 0 ? 0 : 1)
