import { describe, it, expect } from 'vitest'
import {
  MAX_MINUTOS_ATRAS,
  MAX_LARGO_TEXTO,
  esquemaNuevaActividad,
  esquemaCambioActividad,
  resolverOcurrio,
  validarVolverEl,
  numerarLlamadas,
  tituloActividad,
  puedeEditarNota,
  puedeAnular,
  textoNotaDeVinculo,
  esUltimoIntento,
  intentosHasta,
} from './actividades'
import type { Actividad, Intento } from './tipos'

const TOKEN = '3f2b8c1e-4d5a-4b6c-9d7e-8f9a0b1c2d3e'
const primerError = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.error?.issues[0]?.message

describe('constantes', () => {
  it('siete días en minutos y 2.000 caracteres', () => {
    expect(MAX_MINUTOS_ATRAS).toBe(10_080)
    expect(MAX_LARGO_TEXTO).toBe(2000)
  })
})

describe('esquemaNuevaActividad: nota', () => {
  it('acepta una nota y la recorta', () => {
    const r = esquemaNuevaActividad.safeParse({ kind: 'note', body: '  Hola  ', client_token: TOKEN })
    expect(r.success && r.data).toEqual({ kind: 'note', body: 'Hola', client_token: TOKEN })
  })
  it('rechaza la nota vacía con un mensaje en castellano', () => {
    const r = esquemaNuevaActividad.safeParse({ kind: 'note', body: '', client_token: TOKEN })
    expect(r.success).toBe(false)
    expect(primerError(r)).toBe('Escribí algo para guardar la nota')
  })
  it('rechaza la nota de solo espacios', () => {
    expect(esquemaNuevaActividad.safeParse({ kind: 'note', body: '  \n\t ', client_token: TOKEN }).success).toBe(false)
  })
  it('normaliza el texto en NFD a NFC', () => {
    const nfd = 'José llamó'
    const r = esquemaNuevaActividad.safeParse({ kind: 'note', body: nfd, client_token: TOKEN })
    expect(r.success && r.data.body).toBe('José llamó')
  })
  it('2.000 caracteres entran; 2.001 no', () => {
    expect(esquemaNuevaActividad.safeParse({ kind: 'note', body: 'a'.repeat(2000), client_token: TOKEN }).success).toBe(true)
    const r = esquemaNuevaActividad.safeParse({ kind: 'note', body: 'a'.repeat(2001), client_token: TOKEN })
    expect(r.success).toBe(false)
    expect(primerError(r)).toBe('El texto no puede pasar de 2000 caracteres.')
  })
  it('2.000 letras con tilde escritas en NFD entran (se cuentan después de normalizar)', () => {
    expect(
      esquemaNuevaActividad.safeParse({ kind: 'note', body: 'é'.repeat(2000), client_token: TOKEN }).success,
    ).toBe(true)
  })
  it('caracteres especiales de regex se guardan tal cual', () => {
    const r = esquemaNuevaActividad.safeParse({ kind: 'note', body: '.*+?^${}()|[]\\', client_token: TOKEN })
    expect(r.success && r.data.body).toBe('.*+?^${}()|[]\\')
  })
  it('sin client_token o con uno que no es uuid → rechaza', () => {
    expect(esquemaNuevaActividad.safeParse({ kind: 'note', body: 'x' }).success).toBe(false)
    expect(esquemaNuevaActividad.safeParse({ kind: 'note', body: 'x', client_token: 'abc' }).success).toBe(false)
  })
  it('descarta claves desconocidas (no se puede mandar `automatic` ni `created_by`)', () => {
    const r = esquemaNuevaActividad.safeParse({ kind: 'note', body: 'x', client_token: TOKEN, automatic: true, created_by: 'otro' })
    expect(r.success && r.data).toEqual({ kind: 'note', body: 'x', client_token: TOKEN })
  })
  it('un kind desconocido se rechaza', () => {
    expect(esquemaNuevaActividad.safeParse({ kind: 'email', body: 'x', client_token: TOKEN }).success).toBe(false)
  })
  it('un cuerpo nulo se rechaza', () => {
    expect(esquemaNuevaActividad.safeParse(null).success).toBe(false)
  })
})

describe('esquemaNuevaActividad: llamada y WhatsApp', () => {
  const llamada = (o: Record<string, unknown> = {}) => ({ kind: 'call', call_outcome: 'no_atendio', client_token: TOKEN, ...o })
  it('acepta una llamada sin comentario', () => {
    expect(esquemaNuevaActividad.safeParse(llamada()).success).toBe(true)
  })
  it('un comentario vacío en una llamada se toma como sin comentario', () => {
    const r = esquemaNuevaActividad.safeParse(llamada({ body: '   ' }))
    expect(r.success && 'body' in r.data ? r.data.body : undefined).toBeUndefined()
  })
  it('un resultado desconocido se rechaza', () => {
    expect(esquemaNuevaActividad.safeParse(llamada({ call_outcome: 'colgo' })).success).toBe(false)
  })
  it.each([
    [0, true],
    [10_080, true],
    [10_081, false],
    [-1, false],
    [1.5, false],
  ])('hace_minutos %s → %s', (m, valido) => {
    expect(esquemaNuevaActividad.safeParse(llamada({ hace_minutos: m })).success).toBe(valido)
  })
  it('una fecha suelta (occurred_at) se descarta', () => {
    const r = esquemaNuevaActividad.safeParse(llamada({ occurred_at: '2030-01-01T00:00:00Z' }))
    expect(r.success && 'occurred_at' in r.data).toBe(false)
  })
  it('volver_el con formato válido se acepta', () => {
    const r = esquemaNuevaActividad.safeParse(llamada({ call_outcome: 'volver_a_llamar', volver_el: { fecha: '2026-12-01', hora: '10:30' } }))
    expect(r.success).toBe(true)
  })
  it('volver_el con formato inválido se rechaza', () => {
    expect(
      esquemaNuevaActividad.safeParse(llamada({ call_outcome: 'volver_a_llamar', volver_el: { fecha: '1/12/2026', hora: '10:30' } })).success,
    ).toBe(false)
  })
  it('WhatsApp marcado con comentario y hora corregida', () => {
    const r = esquemaNuevaActividad.safeParse({ kind: 'whatsapp_sent', body: 'Le escribí', hace_minutos: 30, client_token: TOKEN })
    expect(r.success && r.data).toEqual({ kind: 'whatsapp_sent', body: 'Le escribí', hace_minutos: 30, client_token: TOKEN })
  })
  it('WhatsApp con call_outcome lo descarta (no es una llamada)', () => {
    const r = esquemaNuevaActividad.safeParse({ kind: 'whatsapp_sent', call_outcome: 'agendo', client_token: TOKEN })
    expect(r.success && 'call_outcome' in r.data).toBe(false)
  })
})

describe('esquemaCambioActividad', () => {
  it('editar con texto', () => {
    const r = esquemaCambioActividad.safeParse({ accion: 'editar', body: ' nuevo ' })
    expect(r.success && r.data).toEqual({ accion: 'editar', body: 'nuevo' })
  })
  it('editar con texto vacío se rechaza', () => {
    expect(esquemaCambioActividad.safeParse({ accion: 'editar', body: '' }).success).toBe(false)
  })
  it('anular sin cuerpo', () => {
    expect(esquemaCambioActividad.safeParse({ accion: 'anular' }).success).toBe(true)
  })
  it('una acción desconocida se rechaza', () => {
    expect(esquemaCambioActividad.safeParse({ accion: 'borrar' }).success).toBe(false)
  })
})

describe('resolverOcurrio', () => {
  const ahora = new Date('2026-11-25T15:00:00Z')
  it('sin minutos → null (la base pone occurred_at = created_at)', () => {
    expect(resolverOcurrio(ahora)).toBeNull()
  })
  it('con 0 → null', () => {
    expect(resolverOcurrio(ahora, 0)).toBeNull()
  })
  it('con 30 → 30 minutos antes', () => {
    expect(resolverOcurrio(ahora, 30)?.toISOString()).toBe('2026-11-25T14:30:00.000Z')
  })
})

describe('validarVolverEl', () => {
  const ahora = new Date('2026-11-25T15:00:00Z') // 12:00 de Argentina
  it('falta → error', () => {
    expect(validarVolverEl(undefined, ahora)).toEqual({ ok: false, error: 'Elegí el día y la hora para volver a llamar.' })
  })
  it('un minuto en el pasado → error', () => {
    expect(validarVolverEl({ fecha: '2026-11-25', hora: '11:59' }, ahora)).toEqual({
      ok: false,
      error: 'El día y la hora para volver a llamar tienen que ser futuros.',
    })
  })
  it('justo ahora → error', () => {
    expect(validarVolverEl({ fecha: '2026-11-25', hora: '12:00' }, ahora).ok).toBe(false)
  })
  it('un minuto en el futuro → ok', () => {
    expect(validarVolverEl({ fecha: '2026-11-25', hora: '12:01' }, ahora)).toEqual({ ok: true })
  })
  it('fecha que no existe → error', () => {
    expect(validarVolverEl({ fecha: '2026-02-30', hora: '10:00' }, ahora).ok).toBe(false)
  })
})

const intento = (
  id: string,
  occurred_at: string,
  o: Partial<Intento> = {},
): Intento => ({
  id,
  deal_id: 'd1',
  kind: 'call',
  call_outcome: 'no_atendio',
  occurred_at,
  created_at: occurred_at,
  ...o,
})

describe('numerarLlamadas', () => {
  it('tres llamadas se numeran 1, 2 y 3 de la más vieja a la más nueva', () => {
    const n = numerarLlamadas([
      intento('c', '2026-11-25T12:00:00Z'),
      intento('a', '2026-11-23T12:00:00Z'),
      intento('b', '2026-11-24T12:00:00Z'),
    ])
    expect([n.get('a'), n.get('b'), n.get('c')]).toEqual([1, 2, 3])
  })
  it('anulada la del medio (no llega a la lista), quedan 1 y 2 sin hueco', () => {
    const n = numerarLlamadas([intento('a', '2026-11-23T12:00:00Z'), intento('c', '2026-11-25T12:00:00Z')])
    expect([n.get('a'), n.get('c')]).toEqual([1, 2])
  })
  it('un WhatsApp entre llamadas no ocupa número', () => {
    const n = numerarLlamadas([
      intento('a', '2026-11-23T12:00:00Z'),
      intento('w', '2026-11-24T12:00:00Z', { kind: 'whatsapp_sent', call_outcome: null }),
      intento('b', '2026-11-25T12:00:00Z'),
    ])
    expect([n.get('a'), n.get('b'), n.has('w')]).toEqual([1, 2, false])
  })
  it('la primera llamada de un proceso nuevo es la 1', () => {
    const n = numerarLlamadas([
      intento('a', '2026-11-01T12:00:00Z', { deal_id: 'viejo' }),
      intento('b', '2026-11-02T12:00:00Z', { deal_id: 'viejo' }),
      intento('c', '2026-11-03T12:00:00Z', { deal_id: 'viejo' }),
      intento('n', '2026-11-25T12:00:00Z', { deal_id: 'nuevo' }),
    ])
    expect(n.get('n')).toBe(1)
    expect(n.get('c')).toBe(3)
  })
  it('una llamada cargada con hora corregida antes de otra pasa a ser la 1', () => {
    const n = numerarLlamadas([
      intento('registrada', '2026-11-25T14:30:00Z', { created_at: '2026-11-25T14:30:00Z' }),
      intento('corregida', '2026-11-25T14:00:00Z', { created_at: '2026-11-25T15:00:00Z' }),
    ])
    expect([n.get('corregida'), n.get('registrada')]).toEqual([1, 2])
  })
  it('las llamadas sin proceso se numeran entre sí, aparte de las de un proceso', () => {
    const n = numerarLlamadas([
      intento('p1', '2026-11-20T12:00:00Z'),
      intento('s1', '2026-11-21T12:00:00Z', { deal_id: null }),
      intento('s2', '2026-11-22T12:00:00Z', { deal_id: null }),
    ])
    expect([n.get('p1'), n.get('s1'), n.get('s2')]).toEqual([1, 1, 2])
  })
  it('con el mismo occurred_at desempata created_at', () => {
    const n = numerarLlamadas([
      intento('segunda', '2026-11-25T12:00:00Z', { created_at: '2026-11-25T12:05:00Z' }),
      intento('primera', '2026-11-25T12:00:00Z', { created_at: '2026-11-25T12:01:00Z' }),
    ])
    expect([n.get('primera'), n.get('segunda')]).toEqual([1, 2])
  })
  it('lista vacía → mapa vacío', () => {
    expect(numerarLlamadas([]).size).toBe(0)
  })
})

describe('tituloActividad', () => {
  it('nota', () => {
    expect(tituloActividad({ kind: 'note', call_outcome: null }, null)).toBe('Nota')
  })
  it('WhatsApp', () => {
    expect(tituloActividad({ kind: 'whatsapp_sent', call_outcome: null }, null)).toBe('WhatsApp enviado')
  })
  it.each([
    ['no_atendio', 'Llamada 1 · No atendió'],
    ['agendo', 'Llamada 1 · Agendó'],
    ['volver_a_llamar', 'Llamada 1 · Volver a llamar'],
    ['no_interesa', 'Llamada 1 · No le interesa'],
    ['numero_equivocado', 'Llamada 1 · Número equivocado'],
  ] as const)('llamada %s', (r, t) => {
    expect(tituloActividad({ kind: 'call', call_outcome: r }, 1)).toBe(t)
  })
  it('llamada sin número', () => {
    expect(tituloActividad({ kind: 'call', call_outcome: 'agendo' }, null)).toBe('Llamada · Agendó')
  })
})

const actividad = (o: Partial<Actividad> = {}): Actividad => ({
  id: 'a1',
  contact_id: 'c1',
  deal_id: 'd1',
  kind: 'note',
  call_outcome: null,
  body: 'texto',
  occurred_at: '2026-11-25T12:00:00Z',
  callback_at: null,
  created_at: '2026-11-25T12:00:00Z',
  updated_at: null,
  created_by: 'autor',
  voided_at: null,
  voided_by: null,
  automatic: false,
  ...o,
})

describe('puedeEditarNota', () => {
  it('el autor edita su nota', () => {
    expect(puedeEditarNota(actividad(), { id: 'autor', role: 'asesor' })).toBe(true)
  })
  it('otra persona no, aunque sea coordinadora', () => {
    expect(puedeEditarNota(actividad(), { id: 'coord', role: 'coordinador' })).toBe(false)
  })
  it('una llamada no se edita, ni el autor', () => {
    expect(puedeEditarNota(actividad({ kind: 'call', call_outcome: 'agendo' }), { id: 'autor', role: 'asesor' })).toBe(false)
  })
  it('una nota anulada no se edita', () => {
    expect(puedeEditarNota(actividad({ voided_at: '2026-11-25T13:00:00Z' }), { id: 'autor', role: 'asesor' })).toBe(false)
  })
  it('la nota automática no la edita ni el autor', () => {
    expect(puedeEditarNota(actividad({ automatic: true }), { id: 'autor', role: 'asesor' })).toBe(false)
  })
  it('la nota automática no la edita la coordinadora', () => {
    expect(puedeEditarNota(actividad({ automatic: true }), { id: 'coord', role: 'coordinador' })).toBe(false)
  })
  it('un rol desconocido no puede nada, aunque sea el autor', () => {
    expect(puedeEditarNota(actividad(), { id: 'autor', role: 'inventado' })).toBe(false)
  })
  it('el abogado no edita, aunque sea el autor', () => {
    expect(puedeEditarNota(actividad(), { id: 'autor', role: 'abogado' })).toBe(false)
  })
  it('una nota sin autor (usuario borrado) no la edita nadie', () => {
    expect(puedeEditarNota(actividad({ created_by: null }), { id: '', role: 'asesor' })).toBe(false)
  })
})

describe('puedeAnular', () => {
  it('el autor anula lo suyo', () => {
    expect(puedeAnular(actividad({ kind: 'call', call_outcome: 'no_atendio' }), { id: 'autor', role: 'asesor' })).toBe(true)
  })
  it.each(['admin', 'dueno', 'coordinador'])('%s anula lo de otro', (role) => {
    expect(puedeAnular(actividad(), { id: 'otro', role })).toBe(true)
  })
  it('un asesor no anula lo de otro', () => {
    expect(puedeAnular(actividad(), { id: 'otro', role: 'asesor' })).toBe(false)
  })
  it('un rol desconocido no anula, aunque sea el autor', () => {
    expect(puedeAnular(actividad(), { id: 'autor', role: 'viewer' })).toBe(false)
  })
  it('la nota automática: el asesor que figura como autor no la anula', () => {
    expect(puedeAnular(actividad({ automatic: true }), { id: 'autor', role: 'asesor' })).toBe(false)
  })
  it('la nota automática: la coordinadora la anula', () => {
    expect(puedeAnular(actividad({ automatic: true }), { id: 'coord', role: 'coordinador' })).toBe(true)
  })
})

describe('textoNotaDeVinculo', () => {
  it('con dirección', () => {
    expect(textoNotaDeVinculo('Av. Siempre Viva 742')).toBe(
      'Nota automática: vinculó este contacto a su proceso de Av. Siempre Viva 742 al completar los datos del cliente.',
    )
  })
  it('sin dirección', () => {
    expect(textoNotaDeVinculo(null)).toBe(
      'Nota automática: vinculó este contacto a un proceso suyo al completar los datos del cliente.',
    )
  })
  it('con una dirección vacía o de solo espacios usa el texto sin dirección', () => {
    expect(textoNotaDeVinculo('   ')).toBe(textoNotaDeVinculo(null))
  })
  it('con una dirección de 500 caracteres la recorta a 200 y el texto no pasa de 2.000', () => {
    const t = textoNotaDeVinculo('x'.repeat(500))
    expect(t).toContain('x'.repeat(200))
    expect(t).not.toContain('x'.repeat(201))
    expect(t.length).toBeLessThanOrEqual(2000)
  })
})

describe('esUltimoIntento e intentosHasta', () => {
  const a = intento('a', '2026-11-23T12:00:00Z')
  const w = intento('w', '2026-11-24T12:00:00Z', { kind: 'whatsapp_sent', call_outcome: null })
  const b = intento('b', '2026-11-25T12:00:00Z')
  const otro = intento('o', '2026-11-26T12:00:00Z', { deal_id: 'd2' })
  const todos = [b, otro, a, w]

  it('el más nuevo del proceso es el último', () => {
    expect(esUltimoIntento(b, todos)).toBe(true)
  })
  it('uno anterior no es el último', () => {
    expect(esUltimoIntento(a, todos)).toBe(false)
  })
  it('un intento de otro proceso posterior no cuenta', () => {
    expect(esUltimoIntento(b, [b, otro])).toBe(true)
  })
  it('con el mismo occurred_at, gana el de created_at más nuevo', () => {
    const x = intento('x', '2026-11-25T12:00:00Z', { created_at: '2026-11-25T12:01:00Z' })
    const y = intento('y', '2026-11-25T12:00:00Z', { created_at: '2026-11-25T12:02:00Z' })
    expect(esUltimoIntento(x, [x, y])).toBe(false)
    expect(esUltimoIntento(y, [x, y])).toBe(true)
  })
  it('una llamada con hora corregida que igual queda última sigue siendo la última', () => {
    const corregida = intento('k', '2026-11-25T13:00:00Z', { created_at: '2026-11-25T15:00:00Z' })
    expect(esUltimoIntento(corregida, [a, b, corregida])).toBe(true)
  })
  it('intentosHasta devuelve los del proceso hasta el evaluado inclusive, en orden', () => {
    expect(intentosHasta(w, todos).map((i) => i.id)).toEqual(['a', 'w'])
  })
  it('intentosHasta con empate de occurred_at desempata created_at', () => {
    const x = intento('x', '2026-11-25T12:00:00Z', { created_at: '2026-11-25T12:01:00Z' })
    const y = intento('y', '2026-11-25T12:00:00Z', { created_at: '2026-11-25T12:02:00Z' })
    expect(intentosHasta(x, [y, x]).map((i) => i.id)).toEqual(['x'])
  })
  it('intentosHasta incluye al evaluado aunque no venga en la lista', () => {
    expect(intentosHasta(b, [a]).map((i) => i.id)).toEqual(['a', 'b'])
  })
  it('las notas no son intentos', () => {
    const nota = intento('n', '2026-11-24T00:00:00Z', { kind: 'note', call_outcome: null })
    expect(intentosHasta(b, [a, nota, b]).map((i) => i.id)).toEqual(['a', 'b'])
  })
})
