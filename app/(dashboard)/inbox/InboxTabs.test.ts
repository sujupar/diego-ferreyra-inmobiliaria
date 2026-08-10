/**
 * El alto del chat de WhatsApp es un número calculado A MANO contra el marco
 * del dashboard, que vive en OTROS DOS archivos. Cuando el rediseño del menú
 * lateral cambió ese marco (header `h-16`+borde → `h-14`+borde, contenido
 * `p-4 md:p-8` → `p-4 md:p-6`), la cuenta de `InboxTabs` quedó vieja y el chat
 * empezó a reservar ~25px de más: una franja muerta abajo, revirtiendo en parte
 * un arreglo que el dueño había pedido explícitamente.
 *
 * Ningún test de comportamiento puede atrapar eso (es una clase de CSS y el
 * síntoma solo se ve en un navegador). Lo que SÍ se puede hacer es rehacer la
 * cuenta desde su fuente: este test LEE los dos archivos del marco, extrae los
 * valores reales y verifica que `InboxTabs` reserve exactamente eso. Si mañana
 * alguien vuelve a tocar el Topbar o el padding del layout, esto se pone en
 * rojo y dice dónde está el número que quedó colgado.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const raiz = resolve(__dirname, '../../..')
const leer = (rel: string) => readFileSync(resolve(raiz, rel), 'utf8')

/** La escala de espaciado de Tailwind: 1 = 0.25rem = 4px. */
const PASO_PX = 4
/** Colchón contra redondeos, heredado del cálculo original. */
const COLCHON_PX = 4

/** Alto real de la barra superior. `border-b` NO suma: el preflight de Tailwind v4 pone `box-sizing: border-box`. */
function altoDelTopbarPx(): number {
  const topbar = leer('components/dashboard/Topbar.tsx')
  const header = topbar.match(/<header\s+className="([^"]+)"/)
  expect(header, 'no se encontró el <header> de Topbar.tsx').toBeTruthy()
  const clases = header![1]
  expect(clases, 'el Topbar dejó de tener border-b: revisar la cuenta del alto del chat').toContain('border-b')
  const h = clases.match(/(?:^|\s)h-(\d+)(?:\s|$)/)
  expect(h, 'no se encontró la clase h-N del Topbar').toBeTruthy()
  return Number(h![1]) * PASO_PX
}

/** Padding vertical del contenedor `#contenido` del layout, en celular y en escritorio. */
function paddingDelContenidoPx(): { celular: number; escritorio: number } {
  const layout = leer('app/(dashboard)/layout.tsx')
  const div = layout.match(/id="contenido"[^>]*className="([^"]+)"/)
  expect(div, 'no se encontró el contenedor #contenido del layout').toBeTruthy()
  const clases = div![1]
  const celular = clases.match(/(?:^|\s)p-(\d+)(?:\s|$)/)
  const escritorio = clases.match(/(?:^|\s)md:p-(\d+)(?:\s|$)/)
  expect(celular, 'no se encontró p-N en #contenido').toBeTruthy()
  expect(escritorio, 'no se encontró md:p-N en #contenido').toBeTruthy()
  // Padding arriba + padding abajo.
  return { celular: Number(celular![1]) * PASO_PX * 2, escritorio: Number(escritorio![1]) * PASO_PX * 2 }
}

/** Los dos `calc(100dvh-Xrem)` que reserva InboxTabs, en px. */
function reservadoPorInboxTabs(): { celular: number; escritorio: number } {
  const tabs = leer('app/(dashboard)/inbox/InboxTabs.tsx')
  const celular = tabs.match(/(?<!md:)h-\[calc\(100dvh-([\d.]+)rem\)\]/)
  const escritorio = tabs.match(/md:h-\[calc\(100dvh-([\d.]+)rem\)\]/)
  expect(celular, 'no se encontró el alto del chat para celular').toBeTruthy()
  expect(escritorio, 'no se encontró el alto del chat para escritorio').toBeTruthy()
  return { celular: Number(celular![1]) * 16, escritorio: Number(escritorio![1]) * 16 }
}

describe('alto del chat de WhatsApp vs el marco real del dashboard', () => {
  it('reserva exactamente la barra superior + el padding del contenido (celular)', () => {
    const esperado = altoDelTopbarPx() + paddingDelContenidoPx().celular + COLCHON_PX
    expect(reservadoPorInboxTabs().celular).toBe(esperado)
  })

  it('reserva exactamente la barra superior + el padding del contenido (escritorio)', () => {
    const esperado = altoDelTopbarPx() + paddingDelContenidoPx().escritorio + COLCHON_PX
    expect(reservadoPorInboxTabs().escritorio).toBe(esperado)
  })

  it('el marco de hoy es h-14 + p-4/md:p-6 (si esto cambia, hay que rehacer la cuenta de arriba)', () => {
    expect(altoDelTopbarPx()).toBe(56)
    expect(paddingDelContenidoPx()).toEqual({ celular: 32, escritorio: 48 })
  })
})
