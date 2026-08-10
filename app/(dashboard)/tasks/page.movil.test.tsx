// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import TasksPage from './page'

/**
 * Piso móvil de Pendientes (`/tasks`).
 *
 * Acá NO hay navegador: `next dev` ni siquiera compila en local (Turbopack
 * revienta con el acento de "Gestión" en la ruta), así que nada de esto se
 * puede mirar. Lo único que queda es fijar por escrito las clases y los nombres
 * accesibles de los que depende el layout — un test de `className` es feo, pero
 * cuando el layout ES la funcionalidad es la única red que tenemos.
 *
 * Lo que estas pruebas defienden, y por qué cada cosa importa en un teléfono:
 *
 *  1. La fila de la tarea SE APILA por debajo de 768px. Sin eso, a 390px al
 *     título le quedan ~110px —el ícono, dos gaps y tres botones se comen el
 *     resto— y la bandeja del día se lee como una columna de palabras sueltas.
 *  2. Completar y descartar tienen ETIQUETA visible y 44px de alto. Son
 *     acciones opuestas y eran dos cuadraditos de 32px pegados: tocar mal
 *     descartaba una tarea en vez de completarla.
 *  3. La descripción deja de estar recortada a un renglón en celular (ahora que
 *     tiene el ancho entero) — `truncate` fija `white-space: nowrap`, así que
 *     soltarlo es parte del arreglo, no un adorno.
 *  4. Todo control que sea solo un ícono conserva su nombre accesible.
 */

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

interface Respuesta { ok: boolean; status: number; body: unknown }
function ok(body: unknown): Respuesta { return { ok: true, status: 200, body } }

function tarea(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    type: 'follow_up',
    title: `Tarea ${id}`,
    description: null,
    deal_id: 'd1',
    appraisal_id: null,
    property_id: null,
    contact_id: null,
    status: 'pending',
    created_at: '2026-08-01T10:00:00Z',
    due_date: null,
    due_time: null,
    all_day: true,
    channel: null,
    ...extra,
  }
}

let pendientes: unknown[]

beforeEach(() => {
  pendientes = [tarea('t1')]
  vi.stubGlobal('fetch', vi.fn((url: string, init?: { method?: string }) => {
    if (init?.method === 'PUT') return Promise.resolve({ ok: true, status: 200, json: async () => ({}) })
    if (url.startsWith('/api/auth/me')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ id: 'u1', role: 'admin' }) })
    }
    if (url.startsWith('/api/tasks')) {
      const estado = new URL(url, 'http://localhost').searchParams.get('status') ?? 'pending'
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ data: estado === 'pending' ? pendientes : [] }),
      })
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [] }) })
  }))
})

async function pintar() {
  render(<TasksPage />)
  await waitFor(() => expect(screen.queryByText('Cargando…')).not.toBeInTheDocument())
}

/** La caja de la tarjeta que contiene a ese elemento (el `CardContent`). */
function filaDe(elemento: HTMLElement): HTMLElement {
  const fila = elemento.closest('[data-slot="card-content"]')
  if (!fila) throw new Error('la tarea no está dentro de un CardContent')
  return fila as HTMLElement
}

describe('/tasks — la fila de la tarea se apila en el teléfono', () => {
  it('el contenedor de la tarea pasa a columna por debajo de md', async () => {
    await pintar()
    const fila = filaDe(await screen.findByText('Tarea t1'))
    expect(fila.className).toContain('max-md:flex-col')
    // Estirar los hijos es lo que hace que la fila de botones ocupe el ancho
    // entero en vez de quedar centrada a la izquierda.
    expect(fila.className).toContain('max-md:items-stretch')
  })

  it('en escritorio sigue siendo la MISMA fila de antes (no se invirtió nada)', async () => {
    await pintar()
    const fila = filaDe(await screen.findByText('Tarea t1'))
    expect(fila.className).toContain('flex')
    expect(fila.className).toContain('items-center')
    expect(fila.className).toContain('gap-4')
    // Ninguna clase de escritorio nueva: el piso móvil viaja SOLO en `max-md:`.
    expect(fila.className).not.toContain('md:flex-row')
  })

  it('el bloque de texto puede encogerse (min-w-0) o un título largo empuja la fila', async () => {
    await pintar()
    const titulo = await screen.findByText('Tarea t1')
    const bloque = titulo.closest('.min-w-0')
    expect(bloque, 'el título no vive dentro de un contenedor con min-w-0').toBeTruthy()
  })
})

describe('/tasks — completar y descartar dejan de ser dos cuadraditos iguales', () => {
  it('cada uno tiene etiqueta visible en celular y sigue teniendo nombre accesible', async () => {
    await pintar()
    const completar = await screen.findByRole('button', { name: 'Completar tarea' })
    const descartar = await screen.findByRole('button', { name: 'Descartar tarea' })

    // El texto existe en el DOM y se esconde con `md:hidden`: en el teléfono se
    // ve, en escritorio queda el ícono solo, como siempre.
    const etiquetaCompletar = completar.querySelector('.md\\:hidden')
    const etiquetaDescartar = descartar.querySelector('.md\\:hidden')
    expect(etiquetaCompletar?.textContent).toBe('Listo')
    expect(etiquetaDescartar?.textContent).toBe('Descartar')
  })

  it('los dos llegan a 44px de alto y se reparten el ancho en celular', async () => {
    await pintar()
    for (const nombre of ['Completar tarea', 'Descartar tarea']) {
      const boton = await screen.findByRole('button', { name: nombre })
      expect(boton.className, `${nombre} sin piso táctil`).toContain('max-md:h-11')
      expect(boton.className, `${nombre} sin repartir el ancho`).toContain('max-md:flex-1')
    }
  })

  it('el atajo para abrir la tarea tiene nombre accesible y no roba el foco al enlace', async () => {
    await pintar()
    const abrir = await screen.findByRole('link', { name: 'Abrir Tarea t1' })
    expect(abrir).toHaveAttribute('href', '/pipeline/d1')
    // El `<button>` de adentro es decorativo: si fuera enfocable habría DOS
    // paradas de teclado para el mismo destino.
    expect(abrir.querySelector('button')).toHaveAttribute('tabindex', '-1')
  })
})

describe('/tasks — la descripción se lee en celular', () => {
  it('no queda recortada a un renglón: dos líneas y sin `nowrap` por debajo de md', async () => {
    pendientes = [tarea('t1', { description: 'Revisar la documentación legal antes del viernes' })]
    await pintar()
    const descripcion = await screen.findByText('Revisar la documentación legal antes del viernes')
    expect(descripcion.className).toContain('max-md:line-clamp-2')
    // `truncate` incluye `white-space: nowrap`; sin soltarlo, `line-clamp` no
    // parte nada y el arreglo no existe.
    expect(descripcion.className).toContain('max-md:whitespace-normal')
    // En escritorio se conserva el recorte de un renglón de siempre.
    expect(descripcion.className).toContain('md:truncate')
  })
})

describe('/tasks — nada afirma una fecha con segundos', () => {
  it('la fecha de alta se imprime corta, sin segundos', async () => {
    pendientes = [tarea('t1', { created_at: '2026-08-01T15:30:45Z', due_date: null })]
    await pintar()
    // Sin atarse al huso horario de la máquina: lo que se fija es la FORMA
    // ("dd/mm/aa, hh:mm" y nada más), que es lo que se rompe si alguien vuelve
    // a `toLocaleString('es-AR')` pelado — ese imprime "1/8/2026, 12:30:45".
    const fecha = await screen.findByText(/^\d{2}\/\d{2}\/\d{2}, \d{2}:\d{2}$/)
    expect(fecha.textContent).not.toMatch(/:\d{2}:\d{2}/)
  })
})
