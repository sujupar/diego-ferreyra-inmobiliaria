'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Megaphone, Globe, MessageCircle, type LucideIcon } from 'lucide-react'
import { InboxClient } from './InboxClient'
import { PortalInquiriesClient } from './PortalInquiriesClient'
import { WhatsappClient } from './WhatsappClient'

type Tab = 'campanas' | 'consultas' | 'whatsapp'

function isTab(v: string | null): v is Tab {
  return v === 'campanas' || v === 'consultas' || v === 'whatsapp'
}

/**
 * La pestaña que abre el Inbox cuando la URL no pide ninguna.
 *
 * Pedido textual del dueño (2026-08-08, probando en su iPhone): «cuando yo voy a
 * inbox, no me debe abrir ni campaña ni consultas. Campañas y consultas es una
 * sección totalmente secundaria. Lo primero que debe abrir es el whatsapp».
 *
 * Un `?tab=` explícito sigue mandando: los enlaces profundos que ya existen
 * —«Ver lead en el CRM» del panel del chat, que apunta a
 * `/inbox?tab=campanas&lead=<id>`— no cambian.
 */
const TAB_INICIAL: Tab = 'whatsapp'

/**
 * Las tres secciones, EN EL ORDEN EN QUE SE VEN. WhatsApp va primera por el
 * mismo motivo por el que es la inicial: si es lo principal y queda tercera, en
 * un teléfono la pantalla abriría con la pestaña activa fuera de cuadro.
 *
 * `corto` / `resto`: en celular la etiqueta es solo «Consultas». El paréntesis
 * «(portales)» son ~85px de los ~288 útiles de un teléfono de 320px — una
 * aclaración que en escritorio suma y en el teléfono se come el lugar de las
 * otras dos pestañas.
 */
const PESTANAS: { id: Tab; corto: string; resto?: string; icon: LucideIcon }[] = [
  { id: 'whatsapp', corto: 'WhatsApp', icon: MessageCircle },
  { id: 'campanas', corto: 'Campañas', icon: Megaphone },
  { id: 'consultas', corto: 'Consultas', resto: ' (portales)', icon: Globe },
]

/**
 * Inbox con tres secciones:
 *  - WhatsApp: chat del CRM — lo que sale automáticamente + lo que responden los clientes.
 *  - Campañas: leads de landing / Meta Ads (InboxClient existente).
 *  - Consultas: consultas entrantes de los portales (MercadoLibre/ZonaProp/Argenprop).
 */
export function InboxTabs({ userRole, userId }: { userRole: string; userId: string }) {
  const [tab, setTab] = useState<Tab>(TAB_INICIAL)
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

  // LA FRANJA DE PESTAÑAS, QUE EN CELULAR NO SE DESLIZA: ENTRAN LAS TRES.
  //
  // Lo que había antes: `inline-flex min-w-max` adentro de un `scroll-x-fade`.
  // Los tres botones sumaban ~459px indivisibles contra los ~358 útiles de un
  // teléfono de 390px, así que la franja "se deslizaba"… salvo que no: como la
  // raíz de la pantalla era `mx-auto` (o sea, `fit-content`), ese `min-w-max`
  // SUBÍA el min-content de toda la caja y la que terminaba corriéndose era la
  // PÁGINA. Arrastrar sobre la barrita era arrastrar la pantalla entera — que es
  // justo lo que el dueño describió: «la barrita que dice campaña, consultas,
  // portales también tiene scrolling a los lados».
  //
  // Cómo entran ahora, y por qué esta forma y no otra:
  //   · TRES COLUMNAS IGUALES (`flex-1 basis-0 min-w-0`) con la etiqueta
  //     truncada. Es la única variante en la que el desborde es IMPOSIBLE por
  //     construcción, a cualquier ancho: cada pestaña vale un tercio y lo que no
  //     entra se corta con puntos suspensivos. Acortar textos a ojo hasta que
  //     "entre en 390" es una cuenta que se vence sola el día que alguien
  //     renombra una pestaña.
  //   · SIN ÍCONO en celular (`max-md:hidden`). Ícono + hueco son 24px por
  //     pestaña, 72px de 288 en una pantalla de 320px: un cuarto del ancho para
  //     un dibujo que no dice nada que la palabra al lado no diga.
  //   · «Consultas», no «Consultas (portales)» — ver `PESTANAS` arriba.
  //   · `px-2` en vez de `px-4`, y `min-h-11` para llegar al mínimo táctil de
  //     44px (con `py-2` la pestaña mide 36).
  // La cuenta a 320px, que es el peor caso: 288 útiles − 10 de borde y relleno
  // = 278 / 3 = 92 por pestaña, − 16 de `px-2` = 76 para el texto, contra ~66
  // que mide «Campañas» a 14px. Entra; y si algún día no entrara, trunca.
  //
  // De `md:` para arriba NADA cambia: vuelve a ser `inline-flex min-w-max` con
  // íconos, `px-4` y la etiqueta larga.
  //
  // El `scroll-x-fade` se queda como red por si mañana aparece una cuarta
  // pestaña o un idioma más largo. OJO: nada de `shrink-0` en ESE div —
  // `shrink-0` sobre un scroller lo obliga a medir su contenido y el desborde
  // vuelve a la página.
  //
  // `--scroll-fade-color`: los degradados de la utilidad TAPAN las dos sombras
  // mientras no hay nada que deslizar, así que tienen que valer el color de lo
  // que hay detrás. Detrás de esta franja está el área de contenido, que es
  // `bg-secondary` (`SidebarInset` en `app/(dashboard)/layout.tsx`) — no una
  // tarjeta. Con el `--card` que la utilidad usa por omisión quedaban dos
  // parches de 24px en los extremos, en TODOS los anchos y también en
  // escritorio: en claro casi no se ven, en oscuro sí (0.18 contra 0.22).
  const tabsRow = (
    <div className="scroll-x-fade min-w-0 max-md:w-full [--scroll-fade-color:var(--secondary)]">
      <div className="flex w-full rounded-lg border bg-muted/40 p-1 md:inline-flex md:w-auto md:min-w-max">
        {PESTANAS.map(({ id, corto, resto, icon: Icono }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition max-md:min-h-11 max-md:min-w-0 max-md:flex-1 max-md:basis-0 max-md:justify-center max-md:px-2 ${
              tab === id ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icono className="h-4 w-4 max-md:hidden" />
            {/* `truncate` sobre el texto: es lo que le da al botón permiso de
                achicarse por debajo de su contenido (un ítem flex con
                `overflow` distinto de `visible` tiene mínimo automático cero).
                Sin esto, `flex-1` no alcanzaría para evitar el desborde. */}
            <span className="truncate">
              {corto}
              {resto && <span className="max-md:hidden">{resto}</span>}
            </span>
          </button>
        ))}
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
          : 'w-full space-y-6 max-w-7xl mx-auto'
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
