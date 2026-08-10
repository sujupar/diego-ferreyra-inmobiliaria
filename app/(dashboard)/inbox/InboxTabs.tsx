'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Megaphone, Globe, MessageCircle } from 'lucide-react'
import { InboxClient } from './InboxClient'
import { PortalInquiriesClient } from './PortalInquiriesClient'
import { WhatsappClient } from './WhatsappClient'

type Tab = 'campanas' | 'consultas' | 'whatsapp'

function isTab(v: string | null): v is Tab {
  return v === 'campanas' || v === 'consultas' || v === 'whatsapp'
}

/**
 * Inbox con tres secciones:
 *  - Campañas: leads de landing / Meta Ads (InboxClient existente).
 *  - Consultas: consultas entrantes de los portales (MercadoLibre/ZonaProp/Argenprop).
 *  - WhatsApp: chat del CRM — lo que sale automáticamente + lo que responden los clientes.
 */
export function InboxTabs({ userRole, userId }: { userRole: string; userId: string }) {
  const [tab, setTab] = useState<Tab>('campanas')
  const [openLeadId, setOpenLeadId] = useState<string | null>(null)

  // Deep link a un lead puntual: `/inbox?tab=campanas&lead=<id>`.
  //
  // Se lee con `useSearchParams`, que es REACTIVO. Antes se leía
  // `window.location.search` en un efecto con deps `[]`, y eso funcionaba solo
  // al entrar de cero: el botón "Ver lead en el CRM" del panel de WhatsApp
  // navega DENTRO de la misma ruta, así que React no remontaba este componente,
  // el efecto no volvía a correr y el botón no hacía absolutamente nada.
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const leadParam = searchParams.get('lead')
  // La conversación abierta también vive en la URL (ver `components/inbox/chat-url.ts`).
  // Acá solo hace falta SABER si hay una abierta, para que en celular el chat se
  // quede con la pantalla entera. No se pasa como prop: la fuente de verdad es
  // la URL y los dos componentes la leen del mismo lugar.
  const chatParam = searchParams.get('chat')

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronizar con la URL, ver comentario arriba
    if (isTab(tabParam)) setTab(tabParam)
  }, [tabParam])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronizar con la URL, ver comentario arriba
    setOpenLeadId(leadParam)
  }, [leadParam])

  const whatsappSubtitle =
    userRole === 'asesor'
      ? 'Los WhatsApp de tus propiedades: los que salen del sistema y las respuestas de los clientes.'
      : 'Todos los WhatsApp del equipo: los que salen del sistema y las respuestas de los clientes.'

  // `scroll-x-fade` (globals.css) + `min-w-0` + `min-w-max` adentro: los tres
  // botones suman ~459px indivisibles y en un teléfono hay ~358px útiles. Como
  // nada arriba en la cadena tenía `overflow-x`, el DOCUMENTO ENTERO ganaba
  // scroll horizontal: el usuario arrastraba de costado y veía la página moverse,
  // con la barra superior desalineada. Pasa en las TRES pestañas, no solo en
  // WhatsApp. Con `scroll-x-fade` el desborde queda contenido acá adentro y las
  // sombras de los extremos avisan que hay más.
  //
  // OJO: nada de `shrink-0` en ESTE div. `shrink-0` sobre un scroller lo obliga a
  // medir lo que mide su contenido y el desborde vuelve a la página.
  //
  // `--scroll-fade-color`: los degradados de la utilidad TAPAN las dos sombras
  // mientras no hay nada que deslizar, así que tienen que valer el color de lo
  // que hay detrás. Detrás de esta franja está el área de contenido, que es
  // `bg-secondary` (`SidebarInset` en `app/(dashboard)/layout.tsx`) — no una
  // tarjeta. Con el `--card` que la utilidad usa por omisión quedaban dos
  // parches de 24px en los extremos, en TODOS los anchos y también en
  // escritorio: en claro casi no se ven, en oscuro sí (0.18 contra 0.22).
  const tabsRow = (
    <div className="scroll-x-fade min-w-0 [--scroll-fade-color:var(--secondary)]">
      <div className="inline-flex min-w-max rounded-lg border bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => setTab('campanas')}
          className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
            tab === 'campanas' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Megaphone className="h-4 w-4" />
          Campañas
        </button>
        <button
          type="button"
          onClick={() => setTab('consultas')}
          className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
            tab === 'consultas' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Globe className="h-4 w-4" />
          Consultas (portales)
        </button>
        <button
          type="button"
          onClick={() => setTab('whatsapp')}
          className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
            tab === 'whatsapp' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <MessageCircle className="h-4 w-4" />
          WhatsApp
        </button>
      </div>
    </div>
  )

  // Ganar altura para el chat (2026-08-01): el dueño se quejó de que el hilo de
  // WhatsApp quedaba "muy chiquito de arriba a abajo" porque toda la pantalla
  // fluía en el documento — el hilo se quedaba con lo que sobraba después de
  // apilar barra de pestañas + título + subtítulo + filtros + cabecera. Para la
  // pestaña de WhatsApp, este contenedor se lleva TODO el alto que sobra y se
  // reparte internamente (`flex-1 min-h-0`) hasta el hilo, que es el único que
  // scrollea.
  //
  // ESTO YA NO CALCULA NADA A MANO (Fase 1 del sistema móvil). Antes decía
  // `h-[calc(100dvh-5.75rem)]`, un número acoplado al alto del Topbar y al padding
  // del layout: cada vez que alguien tocaba el marco, la cuenta quedaba vieja y
  // aparecía una franja muerta abajo del chat (pasó con el rediseño del menú
  // lateral). Peor: los carteles de MODO PRUEBA e impersonación no estaban en la
  // cuenta, así que con uno activo el chat se pasaba del alto de la ventana y lo
  // que se iba abajo del pliegue era justo el compositor.
  //
  // Ahora el alto sale de la CADENA de la Fase 0: `SidebarInset` mide `h-app`
  // (`--app-vh`, el alto real de la ventana, que en el teléfono sigue también al
  // teclado) y `#contenido` es `flex flex-col min-h-0 flex-1`. Este div solo pide
  // `flex-1 min-h-0` y se lleva lo que quede, carteles descontados solos y para
  // siempre. Como el contenedor mide el viewport VISUAL, cuando sube el teclado
  // el hilo pierde alto y el compositor queda pegado arriba del teclado en vez de
  // irse fuera de cuadro.
  //
  // El piso de 520px queda solo en `md:`: en un teléfono con ~640px útiles forzar
  // 520 no hace nada bueno, y con el teclado abierto (~300px) forzaría scroll de
  // página compitiendo con el del hilo.
  //
  // Campañas y Consultas NO se tocan: siguen con el scroll de página de siempre
  // (`space-y-6`, sin alto fijo) — cada una arma su propio título más abajo, ver
  // `InboxClient.tsx` / `PortalInquiriesClient.tsx`.
  const isWhatsapp = tab === 'whatsapp'
  const chatAbierto = isWhatsapp && Boolean(chatParam)

  return (
    <div
      className={
        isWhatsapp
          ? // `max-md:-m-4` con el chat abierto: cancela el `p-4` de `#contenido`
            // para que el chat vaya de borde a borde de la pantalla. Es la otra
            // mitad del "a sangre" (la primera es la Card sin borde ni radio en
            // `WhatsappClient`), y son 32px de ancho que van directo a las burbujas.
            //
            // `md:mx-auto` y no `mx-auto`: `mx-auto` y `-m-4` son la MISMA
            // familia de utilidades (margen horizontal) y cuál gana depende del
            // orden con el que Tailwind las emita, no del orden en el string.
            // Acotando el centrado a `md:` las dos nunca se pisan — y en un
            // teléfono no se pierde nada, porque `max-w-7xl` (1280px) no llega a
            // aplicar en ningún ancho de celular.
            //
            // `max-md:w-auto` va JUNTO al `-m-4` y no se puede separar de él: el
            // margen negativo solo ensancha la caja si el ancho es `auto`. Con
            // `width: 100%` el ancho ya está decidido (358px en un teléfono de
            // 390) y `align-items: stretch` no interviene — la regla es que
            // estirar solo aplica cuando el tamaño en el eje cruzado computa
            // `auto`. El margen negativo entonces solo CORRE la caja hacia la
            // izquierda: el borde izquierdo llega a 0 y sobran 32px de fondo a
            // la derecha, a todo lo alto de la conversación. Con `auto`, estirar
            // resuelve `358 − (−16) − (−16) = 390` y esos 32px van a las
            // burbujas, que es lo que el comentario de arriba promete. Es el
            // mismo patrón que ya usan los tres asistentes (`max-md:-mx-4` sin
            // `w-full`); acá el `w-full` no se puede borrar porque con el chat
            // CERRADO sigue haciendo falta, así que se anula por ancho.
            `flex w-full min-h-0 max-w-7xl flex-1 flex-col gap-3 md:mx-auto md:min-h-[520px] ${
              chatAbierto ? 'max-md:-m-4 max-md:w-auto max-md:gap-0' : ''
            }`
          : 'space-y-6 max-w-7xl mx-auto'
      }
    >
      {/* Pestañas + título de WhatsApp EN LA MISMA FILA (pedido textual del dueño:
          "eso sería mejor que aparezca al lado de esos módulos, a la derecha
          arriba... subís mucho más el chat y ganás espacio"). Campañas/Consultas
          siguen mostrando su propio título más abajo, sin cambios.

          Con un chat ABIERTO en celular, esta fila entera no se ve: la cabecera
          del chat ya dice con quién estás hablando y ya tiene el botón de volver.
          Son ~110px (pestañas + eyebrow + título + subtítulo) que en un teléfono
          valen más como conversación. */}
      {isWhatsapp ? (
        <div
          className={`flex shrink-0 flex-wrap items-start justify-between gap-3 ${
            chatAbierto ? 'max-md:hidden' : ''
          }`}
        >
          {tabsRow}
          <div className="text-right">
            <p className="eyebrow">Mensajería</p>
            <h2 className="display text-lg leading-tight">WhatsApp</h2>
            <p className="text-xs text-muted-foreground">{whatsappSubtitle}</p>
          </div>
        </div>
      ) : (
        tabsRow
      )}

      {tab === 'campanas' ? (
        <InboxClient userRole={userRole} userId={userId} openLeadId={openLeadId} />
      ) : tab === 'consultas' ? (
        <PortalInquiriesClient userRole={userRole} />
      ) : (
        <WhatsappClient userRole={userRole} userId={userId} />
      )}
    </div>
  )
}
