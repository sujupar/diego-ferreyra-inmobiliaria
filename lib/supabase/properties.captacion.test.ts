/**
 * El motor de captación contra una base falsa.
 *
 * Estas tres funciones son las que escriben `properties.status`, y de ese valor
 * cuelgan la landing pública, las consultas de portales, la difusión y el
 * agendamiento del recorrido. Los módulos puros (`lib/properties/captacion.ts`)
 * prueban la REGLA; acá se prueba que la regla llegue a la base tal cual, que
 * los mails salgan una sola vez y que nada degrade una propiedad viva.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Fila = Record<string, any>

const { base } = vi.hoisted(() => ({
  base: {
    filas: new Map<string, Fila>(),
    updates: [] as Array<{ patch: Fila; filtros: Array<[string, string, unknown]>; afectadas: number }>,
    mailsDeCaptacion: [] as string[],
  },
}))

vi.mock('@supabase/supabase-js', () => {
  function query() {
    const estado = {
      op: null as null | 'update',
      patch: null as Fila | null,
      filtros: [] as Array<[string, string, unknown]>,
    }

    function coincide(fila: Fila) {
      return estado.filtros.every(([tipo, col, val]) => {
        if (tipo === 'eq') return fila[col] === val
        if (tipo === 'is') return fila[col] == null && val === null
        if (tipo === 'not-is-null') return fila[col] != null
        return false
      })
    }

    async function ejecutar(unaSola: boolean) {
      const filas = [...base.filas.values()].filter(coincide)
      if (estado.op === 'update') {
        for (const fila of filas) Object.assign(fila, estado.patch)
        base.updates.push({ patch: estado.patch!, filtros: estado.filtros, afectadas: filas.length })
        return { data: filas.map(f => ({ id: f.id })), error: null, count: filas.length }
      }
      if (unaSola) return { data: filas[0] ?? null, error: filas[0] ? null : { message: 'no rows' } }
      return { data: filas, error: null, count: filas.length }
    }

    const api: any = {
      select: () => api,
      update: (patch: Fila) => { estado.op = 'update'; estado.patch = patch; return api },
      eq: (col: string, val: unknown) => { estado.filtros.push(['eq', col, val]); return api },
      is: (col: string, val: unknown) => { estado.filtros.push(['is', col, val]); return api },
      not: (col: string, _op: string, _val: unknown) => { estado.filtros.push(['not-is-null', col, null]); return api },
      order: () => api,
      single: () => ejecutar(true),
      maybeSingle: () => ejecutar(true),
      then: (ok: any, err: any) => ejecutar(false).then(ok, err),
    }
    return api
  }
  return { createClient: () => ({ from: () => query() }) }
})

vi.mock('@/lib/email/notifications/property-captured', () => ({
  notifyPropertyCaptured: vi.fn(async (id: string) => { base.mailsDeCaptacion.push(id) }),
}))

import {
  checkAndAdvanceProperty, reviewProperty, submitPropertyForLegalReview,
  getPropertiesPendientesDeRevisionLegal,
} from './properties'

function sembrar(fila: Fila) {
  const completa: Fila = {
    id: 'p1', status: 'pending_photos', legal_status: 'pending',
    legal_submitted_at: null, legal_notes: null, captured_at: null,
    photos: [], address: 'Rivadavia 4820', ...fila,
  }
  base.filas.set(completa.id, completa)
  return completa
}

beforeEach(() => {
  base.filas = new Map()
  base.updates = []
  base.mailsDeCaptacion = []
})

describe('checkAndAdvanceProperty', () => {
  it('capta con una sola foto y SIN documentación aprobada', async () => {
    const p = sembrar({ status: 'pending_photos', legal_status: 'pending', photos: ['a.jpg'] })
    expect(await checkAndAdvanceProperty('p1')).toBe(true)
    expect(p.status).toBe('approved')
    expect(p.captured_at).toBeTruthy()
    expect(base.mailsDeCaptacion).toEqual(['p1'])
  })

  it('sin fotos no capta ni escribe nada', async () => {
    const p = sembrar({ legal_status: 'approved', photos: [] })
    expect(await checkAndAdvanceProperty('p1')).toBe(false)
    expect(p.status).toBe('pending_photos')
    expect(base.updates).toHaveLength(0)
    expect(base.mailsDeCaptacion).toEqual([])
  })

  it('con la documentación rechazada no capta: es un "no" activo', async () => {
    const p = sembrar({ legal_status: 'rejected', photos: ['a.jpg'] })
    expect(await checkAndAdvanceProperty('p1')).toBe(false)
    expect(p.status).toBe('pending_photos')
    expect(base.mailsDeCaptacion).toEqual([])
  })

  it('una descartada no revive sola al tocarle las fotos', async () => {
    const p = sembrar({ status: 'descartada', legal_status: 'approved', photos: ['a.jpg'] })
    expect(await checkAndAdvanceProperty('p1')).toBe(false)
    expect(p.status).toBe('descartada')
  })

  /**
   * `email_notifications_log` no tiene NI UNA fila de 'property_captured': la
   * idempotencia por log nunca frenó nada. La marca persistida es la que manda.
   */
  it('los mails de captación salen UNA sola vez, aunque se vuelva a captar', async () => {
    const p = sembrar({ photos: ['a.jpg'] })
    await checkAndAdvanceProperty('p1')
    expect(base.mailsDeCaptacion).toEqual(['p1'])

    // Se descarta y se restaura: vuelve a 'draft' con `captured_at` ya puesto.
    p.status = 'draft'
    expect(await checkAndAdvanceProperty('p1')).toBe(true)
    expect(p.status).toBe('approved')
    expect(base.mailsDeCaptacion).toEqual(['p1'])
  })

  it('el reclamo de la primera captación va en el WHERE, no en un if', async () => {
    sembrar({ photos: ['a.jpg'] })
    await checkAndAdvanceProperty('p1')
    const reclamo = base.updates.find(u => 'captured_at' in u.patch)
    expect(reclamo?.filtros).toContainEqual(['is', 'captured_at', null])
  })

  it('no repite el avance sobre una ya captada', async () => {
    sembrar({ status: 'approved', captured_at: '2026-08-01T00:00:00Z', photos: ['a.jpg'] })
    expect(await checkAndAdvanceProperty('p1')).toBe(false)
    expect(base.updates).toHaveLength(0)
  })
})

describe('reviewProperty', () => {
  it('aprobar la documentación capta la propiedad que ya tenía fotos', async () => {
    const p = sembrar({ legal_status: 'pending', legal_submitted_at: 'x', photos: ['a.jpg'] })
    await reviewProperty('p1', true, 'abogado-1', 'Todo en orden')
    expect(p.legal_status).toBe('approved')
    expect(p.status).toBe('approved')
    expect(base.mailsDeCaptacion).toEqual(['p1'])
  })

  /**
   * Bug (C) de la revisión adversarial, agravado por la regla nueva: antes esto
   * escribía `status='rejected'` sin mirar el estado previo. Sobre una
   * propiedad publicada eso daba landing en 404 con tráfico pago encima,
   * consultas rechazadas con 410 — y el aviso IGUAL de vivo en MercadoLibre,
   * porque el trigger de despublicación solo reacciona a 'sold'/'withdrawn'.
   */
  it('rechazar NO apaga una propiedad captada: el rechazo se queda en el carril legal', async () => {
    const p = sembrar({ status: 'approved', captured_at: '2026-08-01T00:00:00Z', photos: ['a.jpg'] })
    await reviewProperty('p1', false, 'abogado-1', 'Escritura vencida')
    expect(p.legal_status).toBe('rejected')
    expect(p.legal_notes).toBe('Escritura vencida')
    expect(p.status).toBe('approved')
  })

  it('rechazar una propiedad que nunca se captó sí la saca del flujo, como antes', async () => {
    const p = sembrar({ status: 'pending_photos', captured_at: null, photos: [] })
    await reviewProperty('p1', false, 'abogado-1')
    expect(p.status).toBe('rejected')
  })
})

describe('submitPropertyForLegalReview', () => {
  /**
   * Bug (A): mandarle los papeles al abogado escribía `status='pending_review'`
   * y apagaba la propiedad entera — Difusión, landing, consultas, recorrido.
   */
  it('no toca `status`: solo marca el envío', async () => {
    const p = sembrar({ status: 'approved', captured_at: '2026-08-01T00:00:00Z', photos: ['a.jpg'] })
    await submitPropertyForLegalReview('p1')
    expect(p.status).toBe('approved')
    expect(p.legal_submitted_at).toBeTruthy()
    expect(base.updates.every(u => !('status' in u.patch))).toBe(true)
  })

  it('re-enviar después de un rechazo la devuelve a pendiente — si no, el rechazo era para siempre', async () => {
    const p = sembrar({ legal_status: 'rejected', legal_notes: 'Escritura vencida', photos: ['a.jpg'] })
    await submitPropertyForLegalReview('p1')
    expect(p.legal_status).toBe('pending')
    expect(p.legal_notes).toBeNull()
    expect(p.legal_submitted_at).toBeTruthy()
  })

  it('un envío normal no toca `legal_status`', async () => {
    const p = sembrar({ legal_status: 'pending', photos: ['a.jpg'] })
    await submitPropertyForLegalReview('p1')
    expect(p.legal_status).toBe('pending')
  })
})

describe('getPropertiesPendientesDeRevisionLegal', () => {
  it('trae solo lo enviado y todavía sin resolver — incluidas las ya captadas', async () => {
    sembrar({ id: 'enviada-captada', status: 'approved', legal_status: 'pending', legal_submitted_at: 'x' })
    sembrar({ id: 'sin-enviar', legal_status: 'pending', legal_submitted_at: null })
    sembrar({ id: 'ya-aprobada', legal_status: 'approved', legal_submitted_at: 'x' })

    const { data, total } = await getPropertiesPendientesDeRevisionLegal()
    expect(data.map((d: Fila) => d.id)).toEqual(['enviada-captada'])
    expect(total).toBe(1)
  })
})
