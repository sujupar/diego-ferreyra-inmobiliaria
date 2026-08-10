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
import { readFileSync } from 'node:fs'
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
  it('las pestañas scrollean adentro de su propia franja', () => {
    // Los tres botones suman ~459px indivisibles contra ~358px útiles en 390px.
    // Sin esto, el DOCUMENTO ENTERO ganaba scroll horizontal, en las TRES
    // pestañas del Inbox.
    expect(tabs).toContain('scroll-x-fade min-w-0')
    expect(tabs).toContain('inline-flex min-w-max')
  })

  it('el scroller NO es `shrink-0` (lo obligaría a medir su contenido)', () => {
    const franja = tabs.match(/className="scroll-x-fade[^"]*"/)
    expect(franja, 'no se encontró la franja de pestañas').toBeTruthy()
    expect(franja![0]).not.toContain('shrink-0')
  })
})
