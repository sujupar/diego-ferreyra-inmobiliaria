// Datos y simulador de red para las pruebas de la ficha (no es código de la app).
import { vi } from 'vitest'
import type { FichaContacto } from '@/lib/crm/ficha'
import type { ActividadDeFicha } from '@/lib/crm/tipos'
import type { TareaDeFicha } from '@/lib/supabase/tasks'

export const CONTACTO = 'c-1'

export function fichaDePrueba(c: Partial<FichaContacto> = {}): FichaContacto {
  return {
    persona: {
      id: CONTACTO,
      full_name: '[TEST] Marcela Ibáñez',
      phone: '+5491155550142',
      email: 'marcela@ejemplo.com',
      origin: 'embudo',
      notes: null,
      asesor: null,
    },
    procesoActivo: { id: 'd-1', etapa: 'solicitud', etiquetaEtapa: 'Solicitud', situacion: 'solicitud' },
    detalles: {
      etapa: { clave: 'solicitud', etiqueta: 'Solicitud' },
      origen: 'embudo',
      campana: 'Tasación · CABA',
      conjunto: null,
      anuncio: null,
      asesor: { mostrar: true, id: null, nombre: null },
      direccion: 'Av. Pedro Goyena 1180',
      barrio: 'Caballito',
      tipoPropiedad: 'Departamento',
      ambientes: 3,
      superficie: null,
    },
    ultimoContacto: { texto: 'Sin contacto todavía', dias: null, alerta: true, en: null },
    procesos: [
      {
        id: 'd-1',
        etapa: 'solicitud',
        etiquetaEtapa: 'Solicitud',
        direccion: 'Av. Pedro Goyena 1180',
        creado: '2026-11-24T13:00:00Z',
        puede_convertir: true,
        deshacer_hasta: null,
      },
    ],
    tasacionesAgendadas: [],
    archivos: { tasaciones: [], propiedades: [] },
    ...c,
  }
}

export function actividadDePrueba(c: Partial<ActividadDeFicha> = {}): ActividadDeFicha {
  return {
    id: 'a-1',
    contact_id: CONTACTO,
    deal_id: 'd-1',
    kind: 'note',
    call_outcome: null,
    body: 'Prefiere que la llamen a la tarde',
    occurred_at: '2026-11-24T13:15:00Z',
    callback_at: null,
    created_at: '2026-11-24T13:15:00Z',
    updated_at: null,
    created_by: 'u-1',
    voided_at: null,
    voided_by: null,
    automatic: false,
    intento: null,
    titulo: 'Nota',
    autor: { id: 'u-1', nombre: 'Paula' },
    editada: false,
    tarea_creada: null,
    puede_editar: true,
    puede_anular: true,
    ...c,
  }
}

export function tareaDePrueba(c: Partial<TareaDeFicha> = {}): TareaDeFicha {
  return {
    id: 't-1',
    title: 'Llamada 2 a [TEST] Marcela Ibáñez',
    type: 'follow_up',
    channel: 'call',
    assigned_to: 'u-1',
    assigned_role: 'coordinador',
    assigned_name: 'Paula',
    created_at: '2026-11-24T13:00:00Z',
    deal_id: 'd-1',
    contact_id: CONTACTO,
    appraisal_id: null,
    source_activity_id: 'a-0',
    description: null,
    due_date: '2026-11-26',
    due_time: '09:00:00',
    all_day: false,
    status: 'pending',
    ...c,
  }
}

type Respuesta = { status?: number; body?: unknown; texto?: string }
type Ruta = (url: string, init?: RequestInit) => Respuesta | Promise<Respuesta>

/**
 * Simula `fetch` por ruta. Cada entrada es un prefijo de URL (+ método opcional,
 * "POST /api/…") y lo que responde. Devuelve el espía para contar pedidos.
 */
export function simularRed(rutas: Record<string, Ruta | Respuesta>) {
  const espia = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada)
    const metodo = (init?.method ?? 'GET').toUpperCase()
    const clave =
      Object.keys(rutas)
        .filter((k) => {
          const [m, p] = k.includes(' ') ? k.split(' ') : ['GET', k]
          return m === metodo && url.startsWith(p)
        })
        .sort((a, b) => b.length - a.length)[0] ?? null
    if (!clave) return new Response(JSON.stringify({ error: `sin ruta simulada: ${metodo} ${url}` }), { status: 599 })
    const def = rutas[clave]
    const r = typeof def === 'function' ? await def(url, init) : def
    const cuerpo = r.texto ?? JSON.stringify(r.body ?? {})
    return new Response(cuerpo, { status: r.status ?? 200 })
  })
  vi.stubGlobal('fetch', espia)
  return espia
}

export const pedidosA = (espia: ReturnType<typeof simularRed>, parte: string, metodo = 'GET') =>
  espia.mock.calls.filter(([u, i]) => String(u).includes(parte) && ((i as RequestInit | undefined)?.method ?? 'GET') === metodo)
