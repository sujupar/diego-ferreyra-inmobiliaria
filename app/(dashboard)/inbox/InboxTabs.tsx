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

  const tabsRow = (
    <div className="inline-flex rounded-lg border bg-muted/40 p-1">
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
  )

  // Ganar altura para el chat (2026-08-01): el dueño se quejó de que el hilo de
  // WhatsApp quedaba "muy chiquito de arriba a abajo" porque toda la pantalla
  // fluía en el documento — el hilo se quedaba con lo que sobraba después de
  // apilar barra de pestañas + título + subtítulo + filtros + cabecera. Para la
  // pestaña de WhatsApp, este contenedor pasa a tener un alto FIJO = alto de la
  // ventana menos la barra de navegación del dashboard (`app/(dashboard)/layout.tsx`,
  // header `h-16` + borde ≈ 65px, más su padding `p-4`/`md:p-8`) — de ahí bajan
  // esos ~4px extra de colchón contra redondeos. `WhatsappClient` asume que este
  // padre YA le da esa altura fija con `flex flex-col` y se reparte el resto
  // internamente (`flex-1 min-h-0`) hasta el hilo, que es el único que scrollea.
  //
  // Campañas y Consultas NO se tocan: siguen con el scroll de página de siempre
  // (`space-y-6`, sin alto fijo) — cada una arma su propio título más abajo, ver
  // `InboxClient.tsx` / `PortalInquiriesClient.tsx`.
  const isWhatsapp = tab === 'whatsapp'

  return (
    <div
      className={
        isWhatsapp
          ? 'mx-auto flex h-[calc(100dvh-6.3125rem)] max-w-7xl min-h-[520px] flex-col gap-3 md:h-[calc(100dvh-8.3125rem)]'
          : 'space-y-6 max-w-7xl mx-auto'
      }
    >
      {/* Pestañas + título de WhatsApp EN LA MISMA FILA (pedido textual del dueño:
          "eso sería mejor que aparezca al lado de esos módulos, a la derecha
          arriba... subís mucho más el chat y ganás espacio"). Campañas/Consultas
          siguen mostrando su propio título más abajo, sin cambios. */}
      {isWhatsapp ? (
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
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
