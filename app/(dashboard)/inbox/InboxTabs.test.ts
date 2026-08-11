/**
 * Contrato de LAYOUT del Inbox (Fase 1 del sistema responsive).
 *
 * Este archivo antes le hacía la cuenta a un `h-[calc(100dvh-5.75rem)]` escrito
 * a mano: leía el alto del Topbar y el padding del layout y verificaba que el
 * número de acá coincidiera. Ese test existía porque el número estaba acoplado a
 * dos archivos ajenos y ya había quedado viejo una vez (franja muerta abajo del
 * chat). La Fase 1 borra el problema de raíz — el alto sale de la cadena
 * `SidebarInset h-app` → `#contenido flex-1 min-h-0` → este contenedor — así que
 * lo que hay que fijar ahora es OTRA cosa: que nadie vuelva a poner un `calc`.
 *
 * Lo demás que se fija acá son clases, y las clases son la funcionalidad: si el
 * bloque de pestañas y título no se oculta con un chat abierto, el hilo vuelve a
 * quedarse con ~50px en un teléfono, y ningún test de comportamiento se entera.
 * No hay navegador donde mirarlo (Turbopack no compila el proyecto en local por
 * el acento de "Gestión" en la ruta), así que se lee el archivo.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const raiz = resolve(__dirname, '../../..')
const leer = (rel: string) => readFileSync(resolve(raiz, rel), 'utf8')

const tabs = leer('app/(dashboard)/inbox/InboxTabs.tsx')
const cliente = leer('app/(dashboard)/inbox/WhatsappClient.tsx')

/**
 * Sin comentarios: la prosa NOMBRA a propósito lo que ya no se usa ("antes decía
 * `h-[calc(...)]`") y no se la puede confundir con código vivo.
 */
const sinComentarios = (fuente: string) => fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const tabsCodigo = sinComentarios(tabs)

describe('InboxTabs — el alto ya no se calcula a mano', () => {
  it('no queda ningún `calc()` de altura: el marco cambia y el chat se acomoda solo', () => {
    // El `calc` viejo no descontaba los carteles de MODO PRUEBA / suplantación,
    // así que con uno activo el compositor se iba abajo del pliegue.
    const calculos = tabsCodigo.match(/h-\[calc\([^\]]*\)\]/g) ?? []
    expect(calculos, `quedaron alturas calculadas a mano: ${calculos.join(', ')}`).toEqual([])
  })

  it('el contenedor de WhatsApp se lleva lo que sobra de la cadena de alto', () => {
    // `flex-1` sin `min-h-0` no se puede achicar y desborda; `min-h-0` sin
    // `flex-1` no se lleva el alto. Los dos, o ninguno sirve.
    expect(tabs).toMatch(/flex w-full min-h-0 max-w-7xl flex-1 flex-col/)
  })

  it('el centrado se acota a `md:` para que no se pelee con el margen negativo', () => {
    // `mx-auto` y `-m-4` son la misma familia: cuál gana depende del orden con
    // el que Tailwind las emita, no del orden en el string. Acotado a `md:`, las
    // dos nunca aplican al mismo ancho.
    expect(tabsCodigo).toContain('md:mx-auto')
    expect(tabsCodigo).not.toMatch(/(?<!md:)mx-auto flex w-full/)
  })

  it('la cadena que hace funcionar el teclado llega entera hasta el chat', () => {
    // El compositor queda pegado ARRIBA del teclado (en vez de irse fuera de
    // cuadro) solo si el alto viaja sin cortes: `SidebarInset` mide `--app-vh`
    // (el viewport VISUAL, que sí se achica con el teclado) → `#contenido` es
    // `flex-1 min-h-0` → este contenedor es `flex-1 min-h-0`. Si cualquiera de
    // los tres eslabones se rompe, el chat vuelve a medir la pantalla ENTERA y
    // el teclado le tapa el compositor. Es un contrato entre tres archivos, así
    // que se verifica desde acá, que es el que lo sufre.
    const layout = leer('app/(dashboard)/layout.tsx')
    expect(layout).toMatch(/<SidebarInset className="[^"]*h-app[^"]*"/)
    expect(layout).toMatch(/id="contenido"[^>]*className="[^"]*min-h-0[^"]*flex-1[^"]*"/)
    expect(tabsCodigo).toMatch(/min-h-0[^'`]*flex-1/)
  })

  it('el piso de 520px vive SOLO en escritorio', () => {
    // En un teléfono con ~640px útiles —o ~300 con el teclado abierto— forzar
    // 520px de alto mínimo produce scroll de página compitiendo con el del hilo.
    expect(tabs).toContain('md:min-h-[520px]')
    expect(tabs).not.toMatch(/(?<!md:)min-h-\[520px\]/)
  })
})

describe('InboxTabs — con un chat abierto, el chat se queda con la pantalla', () => {
  it('el bloque de pestañas + título desaparece en celular', () => {
    // ~110px (pestañas + eyebrow + título + subtítulo). La cabecera del chat ya
    // dice con quién hablás y ya trae el botón de volver.
    expect(tabs).toMatch(/chatAbierto \? 'max-md:hidden' : ''/)
  })

  it('el contenedor cancela el padding del layout para que el chat vaya a sangre', () => {
    expect(tabs).toContain('max-md:-m-4')
  })

  it('el margen negativo viaja con `max-md:w-auto`, o no ensancha nada', () => {
    // El defecto: `w-full` es INCONDICIONAL. Con el ancho ya decidido en 358px
    // (un teléfono de 390), `align-items: stretch` no interviene —la regla es
    // que estirar solo aplica cuando el tamaño en el eje cruzado computa
    // `auto`— y el `-m-4` deja de ensanchar: solo CORRE la caja. El borde
    // izquierdo llega a 0 y sobran 32px de fondo a la derecha, a todo lo alto
    // de la conversación. Con `auto`, estirar resuelve 358−(−16)−(−16) = 390.
    // Los dos van juntos SIEMPRE: `-m-4` sin `w-auto` es el bug.
    const abierto = tabsCodigo.match(/chatAbierto \? '([^']*-m-4[^']*)'/)
    expect(abierto, 'no se encontró la rama del chat abierto').toBeTruthy()
    expect(abierto![1]).toContain('max-md:w-auto')
  })

  it('los degradados de la franja de pestañas valen el color de ATRÁS, no el de tarjeta', () => {
    // `scroll-x-fade` tapa sus dos sombras con dos degradados; si no son del
    // color de la superficie, dejan de tapar y pasan a dibujar dos parches de
    // 24px en los extremos, en TODOS los anchos. Detrás de esta franja está el
    // área de contenido (`bg-secondary`), no una tarjeta.
    expect(tabsCodigo).toContain('[--scroll-fade-color:var(--secondary)]')
  })

  it('sabe si hay un chat abierto leyendo la URL, no una prop', () => {
    // Fuente de verdad única: `WhatsappClient` lee el MISMO parámetro. Con una
    // prop, las dos mitades podrían discrepar sobre si hay un chat abierto.
    expect(tabs).toMatch(/searchParams\.get\('chat'\)/)
    expect(tabs).toMatch(/const chatAbierto = isWhatsapp && Boolean\(chatParam\)/)
  })

  it('la franja de filtros tampoco se renderiza dentro del chat', () => {
    // ~164px en tres filas de "Todas las propiedades / Todos los asesores /
    // Sin responder / Orden IA" arriba de una conversación.
    expect(cliente).toMatch(/selectedPhone \? 'hidden shrink-0 md:block' : 'shrink-0'/)
  })

  it('la tarjeta del hilo va a sangre en celular y queda igual en escritorio', () => {
    expect(cliente).toContain('max-md:rounded-none max-md:border-0 max-md:shadow-none')
  })
})

describe('InboxTabs — la barra de pestañas no arrastra la página de costado', () => {
  // OJO: todo esto se mira sobre `tabsCodigo` (sin comentarios). La prosa del
  // archivo NOMBRA a propósito las clases que ya no se usan ("antes era
  // `inline-flex min-w-max`"), y contra el archivo crudo estas pruebas pasarían
  // por leer un comentario. Ya pasó una vez.
  const franja = tabsCodigo.match(/className="(scroll-x-fade[^"]*)"/)
  const fila = tabsCodigo.match(/className="(flex w-full rounded-lg[^"]*)"/)
  const boton = tabsCodigo.match(/className=\{`(inline-flex items-center gap-2[^`]*)`/)

  it('la franja sigue siendo un scroller propio, como red', () => {
    expect(franja, 'no se encontró la franja de pestañas').toBeTruthy()
    expect(franja![1]).toContain('min-w-0')
  })

  it('el scroller NO es `shrink-0` (lo obligaría a medir su contenido)', () => {
    expect(franja![1]).not.toContain('shrink-0')
  })

  it('en celular la fila de pestañas tiene ancho DEFINIDO, no `min-w-max`', () => {
    // `min-w-max` es un PISO del min-content y `min-width` nunca lo baja: con la
    // raíz de la pantalla en `mx-auto` (o sea, `fit-content`), ese piso subía
    // hasta arriba y la que se corría era la PÁGINA, no la barrita. Arrastrar
    // sobre las pestañas era arrastrar la pantalla entera.
    expect(fila, 'no se encontró la fila de pestañas').toBeTruthy()
    expect(fila![1]).toContain('w-full')
    expect(fila![1]).toContain('md:min-w-max')
    expect(fila![1]).not.toMatch(/(?<!md:)min-w-max/)
  })

  it('en celular las tres pestañas se reparten el ancho y truncan: no pueden desbordar', () => {
    // `flex-1 basis-0 min-w-0` + `truncate` vuelve el desborde IMPOSIBLE por
    // construcción, a CUALQUIER ancho (390, 360, 320 y lo que venga). Acortar
    // textos a ojo "hasta que entre en 390" es una cuenta que se vence sola el
    // día que alguien renombra una pestaña.
    expect(boton, 'no se encontró el botón de pestaña').toBeTruthy()
    for (const clase of ['max-md:flex-1', 'max-md:basis-0', 'max-md:min-w-0']) {
      expect(boton![1], `falta ${clase}`).toContain(clase)
    }
    expect(tabsCodigo).toContain('<span className="truncate">')
  })

  it('en celular la pestaña llega al mínimo táctil de 44px', () => {
    expect(boton![1]).toContain('max-md:min-h-11')
  })

  it('el ícono y el "(portales)" se van en celular, que es de donde sale el ancho', () => {
    // 24px por ícono × 3, y ~85px del paréntesis, sobre 288 útiles a 320px.
    expect(tabsCodigo).toContain('className="h-4 w-4 max-md:hidden"')
    expect(tabsCodigo).toContain('<span className="max-md:hidden">{resto}</span>')
    expect(tabsCodigo).toContain("resto: ' (portales)'")
  })
})

describe('InboxTabs — el Inbox abre en WhatsApp', () => {
  it('la pestaña inicial es WhatsApp, no Campañas', () => {
    // Pedido textual del dueño: "cuando yo voy a inbox, no me debe abrir ni
    // campaña ni consultas… lo primero que debe abrir es el whatsapp".
    expect(tabsCodigo).toMatch(/const TAB_INICIAL: Tab = 'whatsapp'/)
    expect(tabsCodigo).toMatch(/useState<Tab>\(TAB_INICIAL\)/)
  })

  it('y WhatsApp es TAMBIÉN la primera de la fila', () => {
    // Si es lo principal y queda tercera, con la barra deslizable la pantalla
    // abriría con la pestaña activa fuera de cuadro — peor que antes.
    const orden = [...tabsCodigo.matchAll(/\{ id: '(\w+)'/g)].map(m => m[1])
    expect(orden).toEqual(['whatsapp', 'campanas', 'consultas'])
  })

  it('un `?tab=` explícito sigue mandando (los enlaces profundos no se rompen)', () => {
    // `components/inbox/ContactPanel.tsx` linkea a `/inbox?tab=campanas&lead=…`.
    expect(tabsCodigo).toMatch(/if \(isTab\(tabParam\)\) setTab\(tabParam\)/)
  })
})

/**
 * CAMBIAR LA PESTAÑA POR OMISIÓN LE MUEVE EL PISO A TODO EL QUE LINKEABA A
 * `/inbox` PELADO.
 *
 * Cinco enlaces del sistema decían "Ver inbox" desde una tarjeta de leads o de
 * consultas de portales y confiaban en que el Inbox abría en Campañas. Con
 * WhatsApp por omisión, esos cinco pasaron a llevar a una pantalla donde lo que
 * la tarjeta acababa de prometer no está: la tarjeta dice "3 consultas" y el
 * destino muestra conversaciones de WhatsApp. Es el mismo defecto que ya se
 * había arreglado en `/inicio` con las visitas de hoy (D37) — un número que
 * promete un recorte y un destino que muestra otra cosa.
 *
 * El escáner mira la CLASE, no los cinco casos: cualquier `href` a `/inbox` sin
 * `?tab=` que aparezca mañana cae acá.
 */
describe('los enlaces al Inbox llevan su pestaña (no heredan la por omisión)', () => {
  const tsxDe = (dir: string): string[] => {
    const out: string[] = []
    const recorrer = (d: string) => {
      for (const nombre of readdirSync(d)) {
        const abs = resolve(d, nombre)
        if (statSync(abs).isDirectory()) recorrer(abs)
        else if (/\.tsx$/.test(nombre) && !/\.test\.tsx$/.test(nombre)) out.push(abs)
      }
    }
    recorrer(resolve(raiz, dir))
    return out
  }

  it('ningún `href` apunta a `/inbox` sin decir a qué pestaña', () => {
    // Solo el atributo JSX. `lib/nav/sections.ts` y la tarjeta de `/inicio`
    // guardan `'/inbox'` como PROPIEDAD de un objeto y no como href: en el menú
    // es el destino genérico (que el dueño quiere que abra en WhatsApp) y en
    // `/inicio` es la clave contra `navHrefs` para decidir si la tarjeta se
    // muestra — esa tarjeta lleva su `destino: () => '/inbox?tab=campanas'`.
    const pelados: string[] = []
    for (const abs of [...tsxDe('app'), ...tsxDe('components')]) {
      const src = readFileSync(abs, 'utf8')
      for (const m of src.matchAll(/href=(?:"|\{`|\{')\/inbox(?![?\w])/g)) {
        pelados.push(`${abs.slice(raiz.length + 1)}:${src.slice(0, m.index).split('\n').length}`)
      }
    }
    expect(
      pelados,
      'enlaces a `/inbox` sin `?tab=`: caen en WhatsApp, que casi nunca es lo que la tarjeta prometió\n' +
        pelados.join('\n'),
    ).toEqual([])
  })

  it('cada tarjeta lleva a la pestaña donde está lo que contó', () => {
    // Los seis, clavados por nombre y por destino: si alguien "simplifica" uno
    // a `/inbox`, el escáner de arriba lo agarra igual, pero acá además se ve
    // cuál era el destino correcto y por qué.
    const casos: [string, string][] = [
      // Leads de campaña → Campañas. El de cada lead abre el lead, no la bandeja.
      ['components/properties/PropertyLeadsCard.tsx', 'href="/inbox?tab=campanas"'],
      ['components/properties/PropertyLeadsCard.tsx', 'href={`/inbox?tab=campanas&lead=${l.id}`}'],
      ['components/inbox/ContactPanel.tsx', 'href={`/inbox?tab=campanas&lead=${lead.id}`}'],
      // Consultas de portales → Consultas.
      ['components/properties/PropertyInquiriesCard.tsx', 'href="/inbox?tab=consultas"'],
      ['components/metrics/PropertyInquiriesPanel.tsx', 'href="/inbox?tab=consultas"'],
      // El número de `/inicio` sale de `/api/leads/count` → Campañas.
      ['app/(dashboard)/inicio/page.tsx', "destino: () => '/inbox?tab=campanas'"],
    ]
    for (const [archivo, esperado] of casos) {
      expect(leer(archivo), `${archivo} dejó de llevar su pestaña`).toContain(esperado)
    }
  })
})
