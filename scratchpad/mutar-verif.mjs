// Mutación: rompe UNA cosa, corre SOLO los tests que deberían atraparla, restaura.
// NO usa git (el árbol está sin commitear: un `git checkout` borraría el trabajo).
import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

const raiz = '/tmp/fix-movil'
const [, , idx] = process.argv

const MUTACIONES = [
  {
    nombre: '1. red de seguridad: sacar `overflow-x: hidden` de #contenido',
    archivo: 'app/globals.css',
    de: '  overflow-wrap: anywhere;\n  overflow-x: hidden;',
    a: '  overflow-wrap: anywhere;',
    tests: ['app/globals.movil.test.ts'],
  },
  {
    nombre: '2. el arreglo real: sacar `w-full` de la raíz del Inbox',
    archivo: 'app/(dashboard)/inbox/InboxTabs.tsx',
    de: "'w-full space-y-6 max-w-7xl mx-auto'",
    a: "'space-y-6 max-w-7xl mx-auto'",
    tests: ['app/(dashboard)/ancho-movil.test.ts'],
  },
  {
    nombre: '3. el menú de abajo: volver `h-app` a `min-h-svh` en el envoltorio',
    archivo: 'components/ui/sidebar.tsx',
    de: '"group/sidebar-wrapper flex h-app w-full overflow-hidden has-data-[variant=inset]:bg-sidebar"',
    a: '"group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar"',
    tests: ['app/(dashboard)/ancho-movil.test.ts', 'app/impresion-y-container.test.ts'],
  },
  {
    nombre: '4. el Inbox vuelve a abrir en Campañas',
    archivo: 'app/(dashboard)/inbox/InboxTabs.tsx',
    de: "const TAB_INICIAL: Tab = 'whatsapp'",
    a: "const TAB_INICIAL: Tab = 'campanas'",
    tests: ['app/(dashboard)/inbox/InboxTabs.test.ts'],
  },
  {
    nombre: '5. un enlace vuelve a `/inbox` pelado (regresión de destino)',
    archivo: 'components/properties/PropertyInquiriesCard.tsx',
    de: 'href="/inbox?tab=consultas"',
    a: 'href="/inbox"',
    tests: ['app/(dashboard)/inbox/InboxTabs.test.ts'],
  },
  {
    nombre: '6. la fila de fechas deja de envolver',
    archivo: 'components/filters/DateRangeFilter.tsx',
    de: '<div className="flex flex-wrap items-center gap-2">',
    a: '<div className="flex items-center gap-2">',
    tests: ['app/(dashboard)/ancho-movil.test.ts'],
  },
]

const m = MUTACIONES[Number(idx)]
const abs = resolve(raiz, m.archivo)
const backup = abs + '.backup-verif'

copyFileSync(abs, backup)
try {
  const src = readFileSync(abs, 'utf8')
  if (!src.includes(m.de)) throw new Error(`NO ENCONTRADO el fragmento a mutar en ${m.archivo}`)
  writeFileSync(abs, src.replace(m.de, m.a))
  // OJO: nada de pipe a `tail` (el código de salida pasaría a ser el de `tail`)
  // ni rutas sin comillas (`(dashboard)` es sintaxis de shell). El veredicto se
  // lee del TEXTO, que es lo único que no depende de esas dos trampas.
  let salida
  try {
    salida = execSync(
      `./node_modules/.bin/vitest run --config scratchpad/vitest.worktree.config.ts --silent=true ${m.tests
        .map((t) => `'${t}'`)
        .join(' ')} 2>&1`,
      { cwd: raiz, encoding: 'utf8' },
    )
  } catch (e) {
    salida = (e.stdout ?? '') + (e.stderr ?? '')
  }
  const corrio = /Test Files\s+\d+\s+(passed|failed)/.test(salida)
  const rojo = /Test Files.*failed/.test(salida)
  console.log(
    `\n### ${m.nombre}\n>>> ${
      !corrio ? 'NO CORRIÓ — arreglar el arnés' : rojo ? 'ROJO = atrapada' : 'VERDE = SOBREVIVIÓ (hueco de cobertura)'
    }\n`,
  )
  console.log(
    salida
      .split('\n')
      .filter((l) => /Test Files|Tests\s|× |AssertionError|→/.test(l))
      .slice(0, 10)
      .join('\n'),
  )
} finally {
  copyFileSync(backup, abs)
  unlinkSync(backup)
}
