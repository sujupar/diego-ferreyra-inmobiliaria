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

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
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
