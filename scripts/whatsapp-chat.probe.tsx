/**
 * Verificación del chat de WhatsApp del Inbox (`app/(dashboard)/inbox/WhatsappClient.tsx`)
 * SIN navegador.
 *
 * Por qué así: el componente completo hace todo su trabajo real (listar
 * conversaciones, traer un hilo, mandar un mensaje) dentro de `useEffect` +
 * `fetch` — eso no corre bajo `renderToStaticMarkup` (no hay navegador acá, y
 * los tests de componente con happy-dom no arrancan en este host — problema
 * preexistente del entorno). Por eso `MessageBubble`, `ConversationRow` y
 * `WindowNotice` se extrajeron como componentes presentacionales aparte,
 * exportados: reciben los datos por props y no tienen efectos — se pueden
 * renderizar de verdad con `renderToStaticMarkup` armando el JSON a mano con
 * la forma EXACTA documentada en task-6-report.md.
 *
 * El foco de este probe es el requisito NO NEGOCIABLE del brief: un mensaje
 * con status='failed' tiene que mostrar el motivo EN PANTALLA, en rojo,
 * legible — nunca en tooltip ni solo en consola. Todo este trabajo nació de
 * un WhatsApp que no llegó y nadie se enteró.
 *
 * Uso: node --import tsx scripts/whatsapp-chat.probe.tsx
 */
import React from 'react' // tsx compila JSX a React.createElement (sin jsx runtime acá)
import { renderToStaticMarkup } from 'react-dom/server'
import {
  MessageBubble,
  ConversationRow,
  WindowNotice,
  WebhookWarningBanner,
  type ThreadMessage,
  type ConversationListItem,
} from '../app/(dashboard)/inbox/WhatsappClient'

let fallos = 0
function check(nombre: string, ok: boolean, detalle = '') {
  console.log(`${ok ? '✅' : '❌'} ${nombre}${ok ? '' : ` — ${detalle}`}`)
  if (!ok) fallos++
}

function msg(overrides: Partial<ThreadMessage>): ThreadMessage {
  return {
    id: 'm1',
    direction: 'out',
    body_preview: 'Hola, ¿cómo estás?',
    template_name: null,
    status: 'sent',
    error_message: null,
    sent_by: 'user-1',
    created_at: new Date(Date.now() - 5 * 60000).toISOString(),
    media_url: null,
    media_mime_type: null,
    media_filename: null,
    media_type: null,
    ...overrides,
  }
}

// ── Caso 1: mensaje FAILED — el requisito más importante de la tarea ───────
const htmlFailed = renderToStaticMarkup(
  <MessageBubble
    message={msg({ status: 'failed', error_message: 'Número no tiene WhatsApp activo', body_preview: 'Te escribo por la visita de mañana' })}
  />,
)
check('el motivo del fallo aparece EN EL TEXTO (no en un atributo/tooltip)', htmlFailed.includes('Número no tiene WhatsApp activo'))
check('dice explícitamente "No se pudo enviar"', htmlFailed.includes('No se pudo enviar'))
check('usa el color destructivo (rojo), no un gris neutro', htmlFailed.includes('var(--destructive)'))
check('NO queda escondido en un atributo title= (debe ser texto visible)', !/title="[^"]*Número no tiene WhatsApp/.test(htmlFailed))

// ── Caso 2: mensaje failed SIN error_message (Meta no siempre lo manda) ────
const htmlFailedSinMotivo = renderToStaticMarkup(<MessageBubble message={msg({ status: 'failed', error_message: null })} />)
check('con error_message null, igual explica algo legible (no undefined/null crudo)', htmlFailedSinMotivo.includes('WhatsApp no informó el motivo'))
check('no imprime la palabra "null" ni "undefined"', !/\bnull\b|\bundefined\b/.test(htmlFailedSinMotivo))

// ── Caso 3: estados normales de saliente no muestran alerta de error ───────
for (const status of ['accepted', 'sent', 'delivered', 'read', 'skipped']) {
  const html = renderToStaticMarkup(<MessageBubble message={msg({ status })} />)
  check(`status='${status}' no dispara el bloque de error`, !html.includes('No se pudo enviar'), `status=${status}`)
}

// ── Caso 3b (task 9 — estado honesto): 'accepted' dice "Enviado", NUNCA "Enviando…" ──
const htmlAccepted = renderToStaticMarkup(<MessageBubble message={msg({ status: 'accepted' })} />)
check('status=\'accepted\' muestra "Enviado" (Meta ya lo aceptó)', htmlAccepted.includes('Enviado'))
check('status=\'accepted\' NUNCA dice "Enviando…" (era deshonesto — el mensaje ya salió)', !htmlAccepted.includes('Enviando'))

// ── Caso 3c: multimedia entrante se muestra inline, no como "[imagen]" crudo ──
const htmlImagen = renderToStaticMarkup(
  <MessageBubble
    message={msg({
      direction: 'in', status: 'received', sent_by: null,
      body_preview: '[imagen] Mirá el living', media_url: 'https://x.test/signed/foto.jpg', media_mime_type: 'image/jpeg',
    })}
  />,
)
check('una imagen entrante renderiza un <img> con el src firmado', htmlImagen.includes('<img') && htmlImagen.includes('https://x.test/signed/foto.jpg'))
check('el caption de la imagen NO repite el prefijo "[imagen]"', !htmlImagen.includes('[imagen]') && htmlImagen.includes('Mirá el living'))

const htmlDocumento = renderToStaticMarkup(
  <MessageBubble
    message={msg({
      direction: 'in', status: 'received', sent_by: null,
      body_preview: '[documento] plano.pdf', media_url: 'https://x.test/signed/plano.pdf',
      media_mime_type: 'application/pdf', media_filename: 'plano.pdf',
    })}
  />,
)
check('un documento entrante muestra un link de descarga con el nombre real', htmlDocumento.includes('plano.pdf') && htmlDocumento.includes('<a '))

const htmlAudio = renderToStaticMarkup(
  <MessageBubble message={msg({ direction: 'in', status: 'received', sent_by: null, media_url: 'https://x.test/signed/audio.ogg', media_mime_type: 'audio/ogg' })} />,
)
check('un audio entrante renderiza un <audio controls>', htmlAudio.includes('<audio') && htmlAudio.includes('controls'))

// ── Caso 3d: sin media_url (falló la descarga o no hay adjunto), cae al texto plano ──
const htmlSinMedia = renderToStaticMarkup(
  <MessageBubble message={msg({ direction: 'in', status: 'received', sent_by: null, body_preview: '[imagen]', media_url: null })} />,
)
check('sin media_url, cae al texto "[imagen]" (nunca revienta ni queda en blanco)', htmlSinMedia.includes('[imagen]'))

// ── Caso 4: mensaje ENTRANTE no lleva tilde de estado (esas son solo del saliente) ──
const htmlIn = renderToStaticMarkup(<MessageBubble message={msg({ direction: 'in', status: 'received', sent_by: null })} />)
check('un mensaje entrante no muestra "Enviado/Entregado/Leído"', !/Enviado|Entregado|Leído/.test(htmlIn))

// ── Caso 5: el texto de la burbuja cae a la plantilla o a un placeholder, nunca vacío ──
const htmlTemplate = renderToStaticMarkup(<MessageBubble message={msg({ body_preview: null, template_name: 'recordatorio_visita' })} />)
check('sin body_preview usa el nombre de la plantilla', htmlTemplate.includes('Plantilla: recordatorio_visita'))
const htmlVacio = renderToStaticMarkup(<MessageBubble message={msg({ body_preview: null, template_name: null })} />)
check('sin body_preview ni plantilla, no queda en blanco', htmlVacio.includes('(sin contenido)'))

// ── ConversationRow: la fila de la lista también tiene que mostrar el fallo ─
function convo(overrides: Partial<ConversationListItem>): ConversationListItem {
  return {
    phone_e164: '5491122334455',
    contact_name: 'Juana Pérez',
    lead_id: 'lead-1',
    lead_number: 1002,
    property_id: 'prop-1',
    property: { id: 'prop-1', address: 'Av. Corrientes 1234', title: null },
    advisor_id: 'advisor-1',
    advisor_name: 'Martín Asesor',
    last_message: 'Hola, quería consultar por la propiedad',
    last_direction: 'in',
    last_status: 'received',
    last_at: new Date(Date.now() - 10 * 60000).toISOString(),
    unread_count: 1,
    ...overrides,
  }
}

const htmlRowFailed = renderToStaticMarkup(
  <ConversationRow item={convo({ last_direction: 'out', last_status: 'failed', last_message: 'este texto no debería verse' })} active={false} onSelect={() => {}} />,
)
check('la fila de la lista muestra "No se pudo enviar" cuando el último saliente falló', htmlRowFailed.includes('No se pudo enviar'))
check('la fila con fallo NO muestra el preview del texto (prioriza la alerta)', !htmlRowFailed.includes('este texto no debería verse'))

const htmlRowOk = renderToStaticMarkup(<ConversationRow item={convo({})} active={false} onSelect={() => {}} />)
check('una fila normal (sin fallo) muestra el preview del último mensaje', htmlRowOk.includes('Hola, quería consultar por la propiedad'))
check('el badge de no leídos se ve cuando unread_count > 0', htmlRowOk.includes('>1<') || /rounded-full[^>]*>\s*1\s*</.test(htmlRowOk))
check('muestra la dirección de la propiedad asociada', htmlRowOk.includes('Av. Corrientes 1234'))

const htmlRowSinNombre = renderToStaticMarkup(<ConversationRow item={convo({ contact_name: null })} active={false} onSelect={() => {}} />)
check('sin contact_name, cae al teléfono con "+"', htmlRowSinNombre.includes('+5491122334455'))

// ── Caso task 9: "#número de comprador" en la lista ─────────────────────────
check('la fila de la lista muestra el #número de comprador', htmlRowOk.includes('#1002'))
const htmlRowSinNumero = renderToStaticMarkup(<ConversationRow item={convo({ lead_number: null })} active={false} onSelect={() => {}} />)
check('sin lead_number, no muestra un "#null" ni revienta', !/#null/.test(htmlRowSinNumero))

// ── WebhookWarningBanner: el aviso accionable (task 9, prioridad 1) ─────────
const htmlBanner = renderToStaticMarkup(<WebhookWarningBanner />)
check('el aviso menciona el webhook', htmlBanner.toLowerCase().includes('webhook'))
check('el aviso menciona el panel de Meta (accionable, no solo "algo falló")', htmlBanner.includes('Meta'))

// ── WindowNotice: ventana abierta vs cerrada ────────────────────────────────
const htmlAbierta = renderToStaticMarkup(<WindowNotice window={{ open: true, msRemaining: 2 * 60 * 60000 + 15 * 60000 }} />)
check('ventana abierta: dice cuánto tiempo queda', htmlAbierta.includes('Te quedan'))
check('ventana abierta: formatea horas y minutos', htmlAbierta.includes('2 h 15 min'))

const htmlCerrada = renderToStaticMarkup(<WindowNotice window={{ open: false, msRemaining: 0 }} />)
check('ventana cerrada: explica que hace falta una plantilla', htmlCerrada.includes('plantilla aprobada'))
check('ventana cerrada: menciona las 24hs', htmlCerrada.includes('24hs'))

// ── El copy visible está en rioplatense (voseo), no en tuteo ────────────────
const todoElTexto = [htmlFailed, htmlCerrada, htmlAbierta, htmlRowOk, htmlBanner].join(' ').replace(/<[^>]+>/g, ' ')
const tuteo = [/\btú\b/i, /\btienes\b/i, /\bpuedes\b/i, /\bquieres\b/i, /\bregístrate\b/i, /\bdéjanos\b/i]
const hallazgo = tuteo.find(re => re.test(todoElTexto))
check('el copy visible está en voseo (sin tuteo)', !hallazgo, `aparece "${hallazgo}"`)

console.log(fallos === 0 ? '\n🎉 Todo OK' : `\n${fallos} verificación(es) fallaron`)
process.exit(fallos === 0 ? 0 : 1)
