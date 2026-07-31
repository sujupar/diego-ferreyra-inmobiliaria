/**
 * Verificación SIN navegador del chat de WhatsApp del Inbox, rediseñado en
 * `.superpowers/sdd/2026-08-01-etiquetas-y-chat-crm/` (tasks 4/5/6: lista,
 * hilo, panel del cliente).
 *
 * Por qué así: los componentes de más arriba (`WhatsappClient.tsx`) hacen su
 * trabajo real (listar conversaciones, traer un hilo, mandar un mensaje)
 * dentro de `useEffect` + `fetch` — eso no corre bajo `renderToStaticMarkup`
 * (no hay navegador acá). Por eso TODO lo nuevo se armó como componentes
 * presentacionales puros en `components/inbox/` (reciben datos por props, sin
 * fetch propio salvo `ContactPanel`, cuyos `useEffect` simplemente no corren
 * en un render estático — su salida SINCRÓNICA sigue siendo 100% verificable).
 *
 * El foco #1 sigue siendo el requisito NO NEGOCIABLE del brief: un mensaje con
 * status='failed' tiene que mostrar el motivo EN PANTALLA, en rojo, legible —
 * nunca en tooltip ni solo en consola. Todo este trabajo nació de un WhatsApp
 * que no llegó y nadie se enteró.
 *
 * Uso: node --import tsx scripts/whatsapp-chat.probe.tsx
 */
import React from 'react' // tsx compila JSX a React.createElement (sin jsx runtime acá)
import { renderToStaticMarkup } from 'react-dom/server'
import { MessageBubble } from '../components/inbox/MessageBubble'
import { ConversationRow } from '../components/inbox/ConversationRow'
import { ConversationList } from '../components/inbox/ConversationList'
import { Avatar } from '../components/inbox/Avatar'
import { TagChip, TagChipList } from '../components/inbox/TagChip'
import { PipelineStateChip } from '../components/inbox/PipelineStateChip'
import { ThreadHeader } from '../components/inbox/ThreadHeader'
import { ChatThread } from '../components/inbox/ChatThread'
import { ContactPanel } from '../components/inbox/ContactPanel'
import type { ThreadMessage, ConversationListItem, LeadTagRef } from '../components/inbox/types'
import { WindowNotice, WebhookWarningBanner } from '../app/(dashboard)/inbox/WhatsappClient'

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

// ═══════════════════════════════════════════════════════════════════════
// MessageBubble (task 5) — el requisito más importante de toda la tarea.
// ═══════════════════════════════════════════════════════════════════════

const htmlFailed = renderToStaticMarkup(
  <MessageBubble
    message={msg({ status: 'failed', error_message: 'Número no tiene WhatsApp activo', body_preview: 'Te escribo por la visita de mañana' })}
  />,
)
check('el motivo del fallo aparece EN EL TEXTO (no en un atributo/tooltip)', htmlFailed.includes('Número no tiene WhatsApp activo'))
check('dice explícitamente "No se pudo enviar"', htmlFailed.includes('No se pudo enviar'))
check('usa el color destructivo (rojo), no un gris neutro', htmlFailed.includes('var(--destructive)'))
check('NO queda escondido en un atributo title= (debe ser texto visible)', !/title="[^"]*Número no tiene WhatsApp/.test(htmlFailed))

const htmlFailedSinMotivo = renderToStaticMarkup(<MessageBubble message={msg({ status: 'failed', error_message: null })} />)
check('con error_message null, igual explica algo legible (no undefined/null crudo)', htmlFailedSinMotivo.includes('WhatsApp no informó el motivo'))
check('no imprime la palabra "null" ni "undefined"', !/\bnull\b|\bundefined\b/.test(htmlFailedSinMotivo))

for (const status of ['accepted', 'sent', 'delivered', 'read', 'skipped']) {
  const html = renderToStaticMarkup(<MessageBubble message={msg({ status })} />)
  check(`status='${status}' no dispara el bloque de error`, !html.includes('No se pudo enviar'), `status=${status}`)
}

const htmlAccepted = renderToStaticMarkup(<MessageBubble message={msg({ status: 'accepted' })} />)
check('status=\'accepted\' muestra "Enviado" (Meta ya lo aceptó)', htmlAccepted.includes('Enviado'))
check('status=\'accepted\' NUNCA dice "Enviando…" (era deshonesto — el mensaje ya salió)', !htmlAccepted.includes('Enviando'))

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

const htmlSinMedia = renderToStaticMarkup(
  <MessageBubble message={msg({ direction: 'in', status: 'received', sent_by: null, body_preview: '[imagen]', media_url: null })} />,
)
check('sin media_url, cae al texto "[imagen]" (nunca revienta ni queda en blanco)', htmlSinMedia.includes('[imagen]'))

const htmlIn = renderToStaticMarkup(<MessageBubble message={msg({ direction: 'in', status: 'received', sent_by: null })} />)
check('un mensaje entrante no muestra "Enviado/Entregado/Leído"', !/Enviado|Entregado|Leído/.test(htmlIn))

const htmlTemplate = renderToStaticMarkup(<MessageBubble message={msg({ body_preview: null, template_name: 'recordatorio_visita' })} />)
check('sin body_preview usa el nombre de la plantilla', htmlTemplate.includes('Plantilla: recordatorio_visita'))
const htmlVacio = renderToStaticMarkup(<MessageBubble message={msg({ body_preview: null, template_name: null })} />)
check('sin body_preview ni plantilla, no queda en blanco', htmlVacio.includes('(sin contenido)'))

check('las burbujas salientes usan el azul de marca (--brand), no verde WhatsApp', renderToStaticMarkup(<MessageBubble message={msg({})} />).includes('var(--brand)'))

// ═══════════════════════════════════════════════════════════════════════
// Avatar (task 4) — iniciales + color estable por persona.
// ═══════════════════════════════════════════════════════════════════════

const avatarJuan = renderToStaticMarkup(<Avatar name="Juan Pérez" />)
check('el avatar muestra las iniciales', avatarJuan.includes('JP'))
const avatarJuanOtraVez = renderToStaticMarkup(<Avatar name="Juan Pérez" />)
check('la MISMA persona da SIEMPRE el mismo color de avatar (misma clase bg-)', avatarJuan === avatarJuanOtraVez)
const avatarSinNombre = renderToStaticMarkup(<Avatar name={null} />)
check('sin nombre, cae al placeholder "?" sin reventar', avatarSinNombre.includes('?'))

// ═══════════════════════════════════════════════════════════════════════
// TagChip / TagChipList (task 4/5/6) — etiquetas de colores.
// ═══════════════════════════════════════════════════════════════════════

const tagsSample: LeadTagRef[] = [
  { slug: 'exterior', label: 'Comprador del exterior', color: 'violet' },
  { slug: 'caliente', label: 'Caliente', color: 'red' },
  { slug: 'negocia', label: 'Negocia precio', color: 'amber' },
  { slug: 'credito', label: 'Necesita crédito', color: 'blue' },
]
const htmlTagList = renderToStaticMarkup(<TagChipList tags={tagsSample} max={3} />)
check('muestra las etiquetas de la referencia (Comprador del exterior, Caliente, etc.)', htmlTagList.includes('Comprador del exterior') && htmlTagList.includes('Caliente') && htmlTagList.includes('Negocia precio'))
check('con más etiquetas que el máximo, muestra el overflow "+N"', htmlTagList.includes('+1'))
check('sin etiquetas, no renderiza nada (no un contenedor vacío)', renderToStaticMarkup(<TagChipList tags={[]} />) === '')

const htmlTagRemovable = renderToStaticMarkup(<TagChip tag={tagsSample[0]} onRemove={() => {}} />)
check('un chip con onRemove muestra el botón de quitar', htmlTagRemovable.includes('Quitar etiqueta'))

// ═══════════════════════════════════════════════════════════════════════
// PipelineStateChip (task 1/2 → 4/5/6) — resiliente al contrato nuevo.
// ═══════════════════════════════════════════════════════════════════════

check('estado válido muestra su label en español', renderToStaticMarkup(<PipelineStateChip state="visita_agendada" />).includes('Visita agendada'))
check('estado null (API vieja sin el campo) no renderiza nada, no revienta', renderToStaticMarkup(<PipelineStateChip state={null} />) === '')
check('estado undefined no renderiza nada', renderToStaticMarkup(<PipelineStateChip state={undefined} />) === '')
check('un string inválido no renderiza nada ni imprime basura', renderToStaticMarkup(<PipelineStateChip state="no-existe" />) === '')

// ═══════════════════════════════════════════════════════════════════════
// ConversationRow (task 4) — la fila de la lista, estilo "Cota".
// ═══════════════════════════════════════════════════════════════════════

const htmlRowFailed = renderToStaticMarkup(
  <ConversationRow item={convo({ last_direction: 'out', last_status: 'failed', last_message: 'este texto no debería verse' })} active={false} onSelect={() => {}} />,
)
check('la fila muestra "No se pudo enviar" cuando el último saliente falló', htmlRowFailed.includes('No se pudo enviar'))
check('la fila con fallo NO muestra el preview del texto (prioriza la alerta)', !htmlRowFailed.includes('este texto no debería verse'))

const htmlRowOk = renderToStaticMarkup(<ConversationRow item={convo({})} active={false} onSelect={() => {}} />)
check('una fila normal (sin fallo) muestra el preview del último mensaje', htmlRowOk.includes('Hola, quería consultar por la propiedad'))
check('el badge de no leídos se ve cuando unread_count > 0', htmlRowOk.includes('>1<') || /rounded-full[^>]*>\s*1\s*</.test(htmlRowOk))
check('el badge de no leídos es VERDE (emerald), tomado de la referencia', htmlRowOk.includes('bg-emerald-500'))
check('muestra la dirección de la propiedad asociada', htmlRowOk.includes('Av. Corrientes 1234'))
check('muestra el asesor a cargo', htmlRowOk.includes('Martín Asesor'))

const htmlRowSinNombre = renderToStaticMarkup(<ConversationRow item={convo({ contact_name: null })} active={false} onSelect={() => {}} />)
check('sin contact_name, cae al teléfono con "+"', htmlRowSinNombre.includes('+5491122334455'))

check('la fila muestra el #número de comprador', htmlRowOk.includes('#1002'))
const htmlRowSinNumero = renderToStaticMarkup(<ConversationRow item={convo({ lead_number: null })} active={false} onSelect={() => {}} />)
check('sin lead_number, no muestra un "#null" ni revienta', !/#null/.test(htmlRowSinNumero))

const htmlRowConTags = renderToStaticMarkup(<ConversationRow item={convo({ tags: tagsSample.slice(0, 2) })} active={false} onSelect={() => {}} />)
check('la fila muestra las etiquetas de colores del lead (contrato task 3)', htmlRowConTags.includes('Comprador del exterior') && htmlRowConTags.includes('Caliente'))

const htmlRowSinTags = renderToStaticMarkup(<ConversationRow item={convo({ tags: undefined })} active={false} onSelect={() => {}} />)
check('sin campo tags (API vieja, contrato aún no desplegado), la fila igual se ve bien', !htmlRowSinTags.includes('undefined'))

const htmlRowEsperando = renderToStaticMarkup(
  <ConversationRow
    item={convo({ last_direction: 'in', last_status: 'received', last_at: new Date(Date.now() - 3 * 3600000).toISOString() })}
    active={false}
    onSelect={() => {}}
  />,
)
check('último mensaje del cliente sin responder hace RATO se marca visualmente (borde de alerta)', htmlRowEsperando.includes('border-l-amber-500'))
check('...y explica hace cuánto espera', htmlRowEsperando.includes('Esperando respuesta'))

const htmlRowRecienEntrante = renderToStaticMarkup(
  <ConversationRow item={convo({ last_direction: 'in', last_status: 'received', last_at: new Date().toISOString() })} active={false} onSelect={() => {}} />,
)
check('un entrante RECIÉN llegado (dentro del umbral) no dispara la alerta ámbar (esa es solo para demoras largas)', !htmlRowRecienEntrante.includes('border-l-amber-500'))
check(
  'pero SIGUE marcándose visualmente como "sin responder" (texto destacado, no el gris de una charla ya cerrada)',
  htmlRowRecienEntrante.includes('font-medium') && htmlRowRecienEntrante.includes('text-foreground'),
)
const htmlRowContestada = renderToStaticMarkup(
  <ConversationRow item={convo({ last_direction: 'out', last_status: 'sent' })} active={false} onSelect={() => {}} />,
)
check('una fila YA contestada (último saliente) usa el gris apagado, no el destacado de "sin responder"', htmlRowContestada.includes('text-muted-foreground'))

// ═══════════════════════════════════════════════════════════════════════
// ConversationList (task 4) — filtros + estados vacíos. Sin fetch propio,
// 100% verificable con renderToStaticMarkup (solo useState/useMemo).
// ═══════════════════════════════════════════════════════════════════════

const htmlListaVacia = renderToStaticMarkup(
  <ConversationList conversations={[]} loading={false} error={null} selectedPhone={null} onSelectPhone={() => {}} tagCatalog={[]} userRole="admin" />,
)
check('lista vacía: estado vacío que explica, nunca un blanco', htmlListaVacia.includes('Todavía no hay conversaciones'))

const htmlListaError = renderToStaticMarkup(
  <ConversationList conversations={null} loading={false} error="No se pudieron cargar las conversaciones." selectedPhone={null} onSelectPhone={() => {}} tagCatalog={[]} userRole="admin" />,
)
check('lista con error, lo muestra', htmlListaError.includes('No se pudieron cargar'))

const htmlListaConDatos = renderToStaticMarkup(
  <ConversationList
    conversations={[convo({ phone_e164: 'a' }), convo({ phone_e164: 'b', contact_name: 'Otro Cliente' })]}
    loading={false}
    error={null}
    selectedPhone={null}
    onSelectPhone={() => {}}
    tagCatalog={[{ slug: 'caliente', label: 'Caliente', color: 'red' }]}
    userRole="admin"
  />,
)
check('el filtro "Sin responder" está presente y es el más destacado (es el más útil)', htmlListaConDatos.includes('Sin responder'))
check('el buscador está presente', htmlListaConDatos.includes('Buscar por nombre'))
check('con catálogo de etiquetas no vacío, aparece el selector de etiquetas', htmlListaConDatos.includes('Todas las etiquetas'))
check('el selector de estado del embudo siempre está (no depende del contrato nuevo)', htmlListaConDatos.includes('Todos los estados'))

const htmlListaSinCatalogo = renderToStaticMarkup(
  <ConversationList conversations={[convo({})]} loading={false} error={null} selectedPhone={null} onSelectPhone={() => {}} tagCatalog={[]} userRole="admin" />,
)
check('sin catálogo de etiquetas (endpoint task 3 caído/inexistente), NO muestra un selector vacío inútil', !htmlListaSinCatalogo.includes('Todas las etiquetas'))

const htmlListaAsesor = renderToStaticMarkup(
  <ConversationList conversations={[convo({})]} loading={false} error={null} selectedPhone={null} onSelectPhone={() => {}} tagCatalog={[]} userRole="asesor" />,
)
check('un asesor no ve el selector de "por asesor" (ya ve solo lo suyo)', !htmlListaAsesor.includes('Todos los asesores'))

// ═══════════════════════════════════════════════════════════════════════
// ThreadHeader (task 5) — cabecera clickeable que abre el panel del cliente.
// ═══════════════════════════════════════════════════════════════════════

const htmlHeader = renderToStaticMarkup(
  <ThreadHeader
    contactName="Juana Pérez"
    phone="5491122334455"
    leadNumber={1002}
    advisorName="Martín Asesor"
    pipelineState="negociando"
    tags={tagsSample.slice(0, 2)}
    property={{ id: 'prop-1', address: 'Av. Corrientes 1234', title: null, cover_photo: null }}
    onOpenContact={() => {}}
  />,
)
check('la cabecera muestra nombre, #número, teléfono y asesor', htmlHeader.includes('Juana Pérez') && htmlHeader.includes('#1002') && htmlHeader.includes('+5491122334455') && htmlHeader.includes('Martín Asesor'))
check('la cabecera muestra el chip de estado', htmlHeader.includes('Negociando'))
check('la cabecera muestra las etiquetas', htmlHeader.includes('Comprador del exterior'))
check('el cluster del contacto es un <button> clickeable (abre el panel al clic)', /<button[^>]*>[\s\S]*Juana Pérez/.test(htmlHeader))
check('la tarjeta de la propiedad es un link directo a la ficha', htmlHeader.includes('/properties/prop-1'))

const htmlHeaderSinPropiedad = renderToStaticMarkup(
  <ThreadHeader contactName={null} phone="5491100000000" leadNumber={null} advisorName={null} pipelineState={undefined} tags={[]} property={null} onOpenContact={() => {}} />,
)
check('sin propiedad ni datos opcionales, no revienta ni muestra basura', !htmlHeaderSinPropiedad.includes('undefined') && !htmlHeaderSinPropiedad.includes('null'))

// ═══════════════════════════════════════════════════════════════════════
// ChatThread (task 5) — separadores de fecha + franja de alerta.
// ═══════════════════════════════════════════════════════════════════════

const dosDias = [
  msg({ id: 'd1', created_at: '2026-07-28T10:00:00Z', direction: 'in' }),
  msg({ id: 'd2', created_at: '2026-07-28T11:00:00Z', direction: 'out' }),
  msg({ id: 'd3', created_at: '2026-07-29T09:00:00Z', direction: 'in' }),
]
const htmlDosDias = renderToStaticMarkup(<ChatThread messages={dosDias} endRef={{ current: null }} />)
check('dos mensajes el mismo día comparten UN separador (no dos)', (htmlDosDias.match(/de julio de 2026/g) ?? []).length === 2) // "28 de julio…" y "29 de julio…"
check('el separador de fecha tiene el formato "D de mes de AAAA"', /29 de julio de 2026/.test(htmlDosDias))

const htmlVacioHilo = renderToStaticMarkup(<ChatThread messages={[]} endRef={{ current: null }} />)
check('hilo vacío: estado que explica, nunca un blanco', htmlVacioHilo.includes('Todavía no hay mensajes'))

check('el fondo del hilo es LISO (bg-muted/20), sin patrón de imagen', renderToStaticMarkup(<ChatThread messages={dosDias} endRef={{ current: null }} />).includes('bg-muted/20'))
check('nunca usa un patrón de imagen de fondo (no imita WhatsApp)', !renderToStaticMarkup(<ChatThread messages={dosDias} endRef={{ current: null }} />).includes('bg-[url('))

const hilo3hSinResponder = [msg({ id: 's1', direction: 'in', created_at: new Date(Date.now() - 3 * 3600000).toISOString() })]
const htmlFranja = renderToStaticMarkup(<ChatThread messages={hilo3hSinResponder} endRef={{ current: null }} />)
check('franja de alerta: último mensaje del cliente + más de 2hs sin responder', htmlFranja.includes('todavía nadie le contestó'))

const hiloRespondido = [
  msg({ id: 'r1', direction: 'in', created_at: new Date(Date.now() - 3 * 3600000).toISOString() }),
  msg({ id: 'r2', direction: 'out', created_at: new Date(Date.now() - 1000).toISOString() }),
]
check('si el ÚLTIMO mensaje ya es del equipo, no hay franja de alerta', !renderToStaticMarkup(<ChatThread messages={hiloRespondido} endRef={{ current: null }} />).includes('todavía nadie le contestó'))

// ═══════════════════════════════════════════════════════════════════════
// ContactPanel (task 6) — se abre al clic, NUNCA fijo. Datos + etiquetas
// editables + métricas de la conversación.
// ═══════════════════════════════════════════════════════════════════════

check('cerrado (open=false), no renderiza NADA (no ocupa espacio fijo)', renderToStaticMarkup(
  <ContactPanel open={false} onOpenChange={() => {}} phone="5491122334455" contactName="Juana Pérez" lead={null} property={null} pipelineState={null} tags={[]} tagCatalog={[]} advisorName={null} messages={[]} />,
) === '')

const metricsMessages: ThreadMessage[] = [
  msg({ id: 'p1', direction: 'in', created_at: '2026-07-30T10:00:00Z' }),
  msg({ id: 'p2', direction: 'out', created_at: '2026-07-30T10:10:00Z' }),
]

const htmlPanel = renderToStaticMarkup(
  <ContactPanel
    open
    onOpenChange={() => {}}
    phone="5491122334455"
    contactName="Juana Pérez"
    lead={{ id: 'lead-1', name: 'Juana Pérez', lead_number: 1002 }}
    property={{ id: 'prop-1', address: 'Av. Corrientes 1234', title: 'Depto en Corrientes', cover_photo: null }}
    pipelineState="visito"
    tags={tagsSample.slice(0, 2)}
    tagCatalog={tagsSample}
    advisorName="Martín Asesor"
    messages={metricsMessages}
  />,
)
check('el panel abierto muestra el nombre y el avatar grande', htmlPanel.includes('Juana Pérez'))
check('muestra el chip de estado', htmlPanel.includes('Visitó'))
check('muestra las etiquetas asignadas', htmlPanel.includes('Comprador del exterior'))
check('el botón de agregar etiqueta aparece (hay catálogo con etiquetas sin asignar)', htmlPanel.includes('Agregar'))
check('muestra el teléfono', htmlPanel.includes('+5491122334455'))
check('muestra el asesor a cargo', htmlPanel.includes('Martín Asesor'))
check('muestra la propiedad consultada', htmlPanel.includes('Av. Corrientes 1234') || htmlPanel.includes('Depto en Corrientes'))
check('muestra la métrica de primera respuesta (10 min de las dos fechas de prueba)', htmlPanel.includes('10 min'))
check('muestra cuántos mensajes de cada lado', htmlPanel.includes('Del cliente') && htmlPanel.includes('Del equipo'))
check('tiene el botón para saltar a la ficha de la propiedad', htmlPanel.includes('Ver ficha de la propiedad'))
check(
  'tiene el botón para saltar al lead en el CRM',
  htmlPanel.includes('Ver lead en el CRM') && htmlPanel.includes('/inbox?tab=campanas&amp;lead=lead-1'),
)
check('estructura responsiva: hoja desde abajo en mobile, columna desde la derecha en desktop', htmlPanel.includes('slide-in-from-bottom') && htmlPanel.includes('sm:slide-in-from-right'))

const htmlPanelSinLead = renderToStaticMarkup(
  <ContactPanel
    open
    onOpenChange={() => {}}
    phone="5491100000000"
    contactName={null}
    lead={null}
    property={null}
    pipelineState={undefined}
    tags={[]}
    tagCatalog={[]}
    advisorName={null}
    messages={[]}
  />,
)
check('sin lead vinculado, avisa que no se puede etiquetar en vez de romper', htmlPanelSinLead.includes('no está vinculada a un lead'))
check('sin mensajes, la primera respuesta dice "Sin respuesta aún" (no null/NaN)', htmlPanelSinLead.includes('Sin respuesta aún'))
check('sin datos, no imprime basura (null/undefined/NaN)', !/\bnull\b|\bundefined\b|\bNaN\b/.test(htmlPanelSinLead))

// ═══════════════════════════════════════════════════════════════════════
// WindowNotice / WebhookWarningBanner — siguen en WhatsappClient.tsx.
// ═══════════════════════════════════════════════════════════════════════

const htmlBanner = renderToStaticMarkup(<WebhookWarningBanner />)
check('el aviso menciona el webhook', htmlBanner.toLowerCase().includes('webhook'))
check('el aviso menciona el panel de Meta (accionable, no solo "algo falló")', htmlBanner.includes('Meta'))

const htmlAbierta = renderToStaticMarkup(<WindowNotice window={{ open: true, msRemaining: 2 * 60 * 60000 + 15 * 60000 }} />)
check('ventana abierta: dice cuánto tiempo queda', htmlAbierta.includes('Te quedan'))
check('ventana abierta: formatea horas y minutos', htmlAbierta.includes('2 h 15 min'))

const htmlCerrada = renderToStaticMarkup(<WindowNotice window={{ open: false, msRemaining: 0 }} />)
check('ventana cerrada: explica que hace falta una plantilla', htmlCerrada.includes('plantilla aprobada'))
check('ventana cerrada: menciona las 24hs', htmlCerrada.includes('24hs'))

// ═══════════════════════════════════════════════════════════════════════
// Copy en rioplatense (voseo) en TODA la pantalla nueva.
// ═══════════════════════════════════════════════════════════════════════

const todoElTexto = [
  htmlFailed, htmlCerrada, htmlAbierta, htmlRowOk, htmlBanner, htmlListaConDatos, htmlHeader, htmlFranja, htmlPanel, htmlPanelSinLead,
]
  .join(' ')
  .replace(/<[^>]+>/g, ' ')
const tuteo = [/\btú\b/i, /\btienes\b/i, /\bpuedes\b/i, /\bquieres\b/i, /\bregístrate\b/i, /\bdéjanos\b/i]
const hallazgo = tuteo.find(re => re.test(todoElTexto))
check('el copy visible está en voseo (sin tuteo)', !hallazgo, `aparece "${hallazgo}"`)

console.log(fallos === 0 ? '\n🎉 Todo OK' : `\n${fallos} verificación(es) fallaron`)
process.exit(fallos === 0 ? 0 : 1)
