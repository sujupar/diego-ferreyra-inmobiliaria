'use client'

import { useState } from 'react'
import { Megaphone, Globe, MessageCircle } from 'lucide-react'
import { InboxClient } from './InboxClient'
import { PortalInquiriesClient } from './PortalInquiriesClient'
import { WhatsappClient } from './WhatsappClient'

type Tab = 'campanas' | 'consultas' | 'whatsapp'

/**
 * Inbox con tres secciones:
 *  - Campañas: leads de landing / Meta Ads (InboxClient existente).
 *  - Consultas: consultas entrantes de los portales (MercadoLibre/ZonaProp/Argenprop).
 *  - WhatsApp: chat del CRM — lo que sale automáticamente + lo que responden los clientes.
 */
export function InboxTabs({ userRole, userId }: { userRole: string; userId: string }) {
  const [tab, setTab] = useState<Tab>('campanas')

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
        <InboxClient userRole={userRole} userId={userId} />
      ) : tab === 'consultas' ? (
        <PortalInquiriesClient userRole={userRole} />
      ) : (
        <WhatsappClient userRole={userRole} userId={userId} />
      )}
    </div>
  )
}
