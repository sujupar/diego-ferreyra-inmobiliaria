// Mutación: rompe UNA cosa, corre los tests que deberían atraparla, restaura.
// Uso: node scratchpad/mutar.mjs <numero>
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'

const raiz = path.resolve(import.meta.dirname, '..')

const MUTACIONES = [
  {
    nombre: '1 · saco el `overflow-x: hidden` de #contenido',
    archivo: 'app/globals.css',
    de: '  overflow-wrap: anywhere;\n  overflow-x: hidden;\n}',
    a: '  overflow-wrap: anywhere;\n}',
    tests: ['app/globals.movil.test.ts'],
  },
  {
    nombre: '2 · devuelvo `min-h-svh` al envoltorio del menú',
    archivo: 'components/ui/sidebar.tsx',
    de: '"group/sidebar-wrapper flex h-app w-full overflow-hidden has-data-[variant=inset]:bg-sidebar"',
    a: '"group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar"',
    tests: ['app/(dashboard)/ancho-movil.test.ts'],
  },
  {
    nombre: '3 · le saco el `w-full` a la raíz de la ficha de propiedad',
    archivo: 'app/(dashboard)/properties/[id]/page.tsx',
    de: '"w-full space-y-6 max-w-6xl mx-auto pb-10"',
    a: '"space-y-6 max-w-6xl mx-auto pb-10"',
    tests: ['app/(dashboard)/ancho-movil.test.ts'],
  },
  {
    nombre: '4 · devuelvo el `min-w-max` sin acotar a la fila de pestañas',
    archivo: 'app/(dashboard)/inbox/InboxTabs.tsx',
    de: '"flex w-full rounded-lg border bg-muted/40 p-1 md:inline-flex md:w-auto md:min-w-max"',
    a: '"inline-flex min-w-max rounded-lg border bg-muted/40 p-1"',
    tests: ['app/(dashboard)/inbox/InboxTabs.test.ts'],
  },
  {
    nombre: '5 · el Inbox vuelve a abrir en Campañas',
    archivo: 'app/(dashboard)/inbox/InboxTabs.tsx',
    de: "const TAB_INICIAL: Tab = 'whatsapp'",
    a: "const TAB_INICIAL: Tab = 'campanas'",
    tests: ['app/(dashboard)/inbox/InboxTabs.test.ts'],
  },
  {
    nombre: '6 · saco el `flex-wrap` de la fila de fechas del filtro',
    archivo: 'components/filters/DateRangeFilter.tsx',
    de: '<div className="flex flex-wrap items-center gap-2">',
    a: '<div className="flex items-center gap-2">',
    tests: ['app/(dashboard)/ancho-movil.test.ts'],
  },
  {
    nombre: '7 · el bloque de impresión se olvida del envoltorio',
    archivo: 'app/globals.css',
    de: "  [data-slot='sidebar-wrapper'],\n  [data-slot='sidebar-inset'] {",
    a: "  [data-slot='sidebar-inset'] {",
    tests: ['app/impresion-y-container.test.ts'],
  },
  {
    nombre: '8 · las pestañas dejan de truncar (vuelven a poder desbordar)',
    archivo: 'app/(dashboard)/inbox/InboxTabs.tsx',
    de: 'max-md:min-h-11 max-md:min-w-0 max-md:flex-1 max-md:basis-0 max-md:justify-center max-md:px-2',
    a: 'max-md:min-h-11 max-md:px-2',
    tests: ['app/(dashboard)/inbox/InboxTabs.test.ts'],
  },
  {
    nombre: '9 · el orden vuelve a poner WhatsApp tercera',
    archivo: 'app/(dashboard)/inbox/InboxTabs.tsx',
    de: "  { id: 'whatsapp', corto: 'WhatsApp', icon: MessageCircle },\n  { id: 'campanas', corto: 'Campañas', icon: Megaphone },",
    a: "  { id: 'campanas', corto: 'Campañas', icon: Megaphone },\n  { id: 'whatsapp', corto: 'WhatsApp', icon: MessageCircle },",
    tests: ['app/(dashboard)/inbox/InboxTabs.test.ts'],
  },
  {
    nombre: '10 · `ContentScrollReset` deja de devolver el eje X',
    archivo: 'components/dashboard/ContentScrollReset.tsx',
    de: '        panel.scrollLeft = 0',
    a: '        void 0',
    tests: ['components/dashboard/ContentScrollReset.test.tsx'],
  },
  {
    nombre: '11 · la tarjeta de leads vuelve a linkear a `/inbox` pelado',
    archivo: 'components/properties/PropertyLeadsCard.tsx',
    de: 'href="/inbox?tab=campanas"',
    a: 'href="/inbox"',
    tests: ['app/(dashboard)/inbox/InboxTabs.test.ts'],
  },
  {
    nombre: '12 · la tarjeta de consultas de portales vuelve a `/inbox` pelado',
    archivo: 'components/properties/PropertyInquiriesCard.tsx',
    de: 'href="/inbox?tab=consultas"',
    a: 'href="/inbox"',
    tests: ['app/(dashboard)/inbox/InboxTabs.test.ts'],
  },
  {
    nombre: '13 · la tarjeta de `/inicio` pierde su destino con pestaña',
    archivo: 'app/(dashboard)/inicio/page.tsx',
    de: "    destino: () => '/inbox?tab=campanas',\n",
    a: '',
    tests: ['app/(dashboard)/inbox/InboxTabs.test.ts'],
  },
  {
    nombre: '14 · el "Abrir" de un lead deja de abrir ESE lead',
    archivo: 'components/properties/PropertyLeadsCard.tsx',
    de: 'href={`/inbox?tab=campanas&lead=${l.id}`}',
    a: 'href="/inbox?tab=campanas"',
    tests: ['app/(dashboard)/inbox/InboxTabs.test.ts'],
  },
]

const soloEste = process.argv[2] ? Number(process.argv[2]) : null
for (const [i, m] of MUTACIONES.entries()) {
  if (soloEste !== null && i + 1 !== soloEste) continue
  const abs = path.join(raiz, m.archivo)
  const original = readFileSync(abs, 'utf8')
  if (!original.includes(m.de)) {
    console.log(`SALTEADA  ${m.nombre} — el texto a romper no está`)
    continue
  }
  writeFileSync(abs, original.replace(m.de, m.a))
  let salida = ''
  try {
    salida = execSync(`./node_modules/.bin/vitest run ${m.tests.map(t => JSON.stringify(t)).join(' ')} --silent=true`, {
      cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    })
    console.log(`❌ VERDE (el test NO lo atrapó)  ${m.nombre}`)
  } catch (e) {
    const txt = (e.stdout ?? '') + (e.stderr ?? '')
    const fallos = txt.match(/Tests\s+(\d+) failed/)
    console.log(`✅ ROJO (${fallos ? fallos[1] : '?'} test(s) en rojo)  ${m.nombre}`)
  } finally {
    writeFileSync(abs, original)
  }
}
console.log('\nrestaurado todo')
