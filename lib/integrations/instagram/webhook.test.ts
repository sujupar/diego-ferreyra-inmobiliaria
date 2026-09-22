import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'crypto'
import { parsearAviso, verificarFirmaInstagram } from './webhook'

const SECRETO = 'secreto-de-prueba'

beforeEach(() => {
  process.env.META_APP_SECRET = SECRETO
})

afterEach(() => {
  process.env.META_APP_SECRET = SECRETO
})

function firmar(crudo: string, secreto = SECRETO): string {
  return 'sha256=' + createHmac('sha256', secreto).update(crudo, 'utf8').digest('hex')
}

describe('verificarFirmaInstagram', () => {
  const crudo = '{"object":"instagram","entry":[]}'

  it('acepta la firma correcta', () => {
    expect(verificarFirmaInstagram(crudo, firmar(crudo))).toBe(true)
  })

  it('rechaza una firma de OTRO cuerpo', () => {
    // El ataque real: mandar un cuerpo cualquiera con una firma válida copiada
    // de otro aviso, para que la cuenta le escriba a quien el atacante quiera.
    expect(verificarFirmaInstagram('{"object":"otro"}', firmar(crudo))).toBe(false)
  })

  it('rechaza una firma hecha con otro secreto', () => {
    expect(verificarFirmaInstagram(crudo, firmar(crudo, 'otro-secreto'))).toBe(false)
  })

  it('rechaza cuando no viene firma', () => {
    expect(verificarFirmaInstagram(crudo, null)).toBe(false)
    expect(verificarFirmaInstagram(crudo, '')).toBe(false)
  })

  it('rechaza si falta el secreto en el entorno (falla cerrado)', () => {
    // Sin secreto no se puede verificar nada. Dejar pasar "porque no podemos
    // comprobar" convierte la ruta en un disparador público de mensajes.
    delete process.env.META_APP_SECRET
    expect(verificarFirmaInstagram(crudo, firmar(crudo))).toBe(false)
  })

  it('no explota con una firma de largo distinto ni con basura', () => {
    expect(verificarFirmaInstagram(crudo, 'sha256=abcd')).toBe(false)
    expect(verificarFirmaInstagram(crudo, 'no-es-una-firma')).toBe(false)
    expect(verificarFirmaInstagram(crudo, 'sha256=zzzz')).toBe(false)
  })

  it('acepta la firma sin el prefijo sha256=', () => {
    const hex = createHmac('sha256', SECRETO).update(crudo, 'utf8').digest('hex')
    expect(verificarFirmaInstagram(crudo, hex)).toBe(true)
  })
})

describe('parsearAviso — comentarios', () => {
  it('saca el comentario del formato real de Meta', () => {
    const aviso = {
      object: 'instagram',
      entry: [{
        id: '17841421542114621',
        time: 1758542636,
        changes: [{
          field: 'comments',
          value: {
            id: 'c1',
            text: 'propiedad',
            media: { id: 'm1' },
            from: { id: 'u1', username: 'juan' },
            timestamp: '2026-09-22T11:00:00+0000',
          },
        }],
      }],
    }

    expect(parsearAviso(aviso).comentarios).toEqual([{
      igMediaId: 'm1',
      comentarioId: 'c1',
      autorId: 'u1',
      username: 'juan',
      texto: 'propiedad',
      creadoEn: '2026-09-22T11:00:00+0000',
    }])
  })

  it('sin `timestamp` en el comentario, toma la hora del evento (`entry.time`, en segundos)', () => {
    // Los ejemplos de Meta para comentarios de Instagram NO traen `timestamp`
    // dentro de `value`: la hora viene en `entry.time`. Sin esta lectura, cada
    // comentario real llegaba sin hora, la decisión lo trataba como anterior a
    // la activación y el sistema no le respondía a NADIE, sin ningún error.
    const aviso = {
      object: 'instagram',
      entry: [{
        id: '17841421542114621',
        time: 1758542636,
        changes: [{ field: 'comments', value: { id: 'c1', text: 'doblas', media: { id: 'm1' }, from: { id: 'u1', username: 'juan' } } }],
      }],
    }
    expect(parsearAviso(aviso).comentarios[0]?.creadoEn).toBe(new Date(1758542636 * 1000).toISOString())
  })

  it('entiende `entry.time` también si viene en milisegundos', () => {
    const aviso = {
      object: 'instagram',
      entry: [{
        id: 'x',
        time: 1758542636000,
        changes: [{ field: 'comments', value: { id: 'c1', text: 'a', media: { id: 'm1' }, from: { id: 'u1' } } }],
      }],
    }
    expect(parsearAviso(aviso).comentarios[0]?.creadoEn).toBe(new Date(1758542636000).toISOString())
  })

  it('sin ninguna de las dos horas deja la fecha vacía (la decisión la trata como vieja: no escribe)', () => {
    const aviso = {
      object: 'instagram',
      entry: [{ id: 'x', changes: [{ field: 'comments', value: { id: 'c1', text: 'a', media: { id: 'm1' }, from: { id: 'u1' } } }] }],
    }
    expect(parsearAviso(aviso).comentarios[0]?.creadoEn).toBe('')
  })

  it('una hora de evento absurda no se usa', () => {
    const aviso = {
      object: 'instagram',
      entry: [{ id: 'x', time: 'ayer', changes: [{ field: 'comments', value: { id: 'c1', text: 'a', media: { id: 'm1' }, from: { id: 'u1' } } }] }],
    }
    expect(parsearAviso(aviso).comentarios[0]?.creadoEn).toBe('')
  })

  it('descarta un comentario sin el id del reel: no sabríamos de qué propiedad es', () => {
    const aviso = {
      object: 'instagram',
      entry: [{ id: 'x', changes: [{ field: 'comments', value: { id: 'c1', text: 'hola', from: { id: 'u1' } } }] }],
    }
    expect(parsearAviso(aviso).comentarios).toEqual([])
  })

  it('ignora los cambios que no son comentarios', () => {
    const aviso = {
      object: 'instagram',
      entry: [{ id: 'x', changes: [{ field: 'mentions', value: { id: 'c1', media: { id: 'm1' }, from: { id: 'u1' } } }] }],
    }
    expect(parsearAviso(aviso).comentarios).toEqual([])
  })

  it('junta varios comentarios de varias entradas', () => {
    const uno = { field: 'comments', value: { id: 'c1', text: 'a', media: { id: 'm1' }, from: { id: 'u1' }, timestamp: 't1' } }
    const dos = { field: 'comments', value: { id: 'c2', text: 'b', media: { id: 'm1' }, from: { id: 'u2' }, timestamp: 't2' } }
    const aviso = { object: 'instagram', entry: [{ id: 'x', changes: [uno] }, { id: 'y', changes: [dos] }] }
    expect(parsearAviso(aviso).comentarios).toHaveLength(2)
  })
})

describe('parsearAviso — el botón', () => {
  it('saca el botón tocado con su dato', () => {
    const aviso = {
      object: 'instagram',
      entry: [{
        id: 'x',
        messaging: [{
          sender: { id: 'u1' },
          recipient: { id: 'ig' },
          message: { mid: 'm', text: 'Sí, pasámela', quick_reply: { payload: 'reel:abc' } },
        }],
      }],
    }
    expect(parsearAviso(aviso).botones).toEqual([{ remitenteId: 'u1', dato: 'reel:abc' }])
  })

  it('un mensaje escrito a mano NO es un botón', () => {
    // Si lo tratáramos como botón, cualquiera que escriba "hola" recibiría el
    // enlace de una landing al azar.
    const aviso = {
      object: 'instagram',
      entry: [{ id: 'x', messaging: [{ sender: { id: 'u1' }, message: { mid: 'm', text: 'hola' } }] }],
    }
    expect(parsearAviso(aviso).botones).toEqual([])
  })

  it('un eco de nuestro propio mensaje no se procesa', () => {
    // Instagram avisa también de los mensajes que mandamos nosotros.
    const aviso = {
      object: 'instagram',
      entry: [{
        id: 'x',
        messaging: [{
          sender: { id: 'ig' },
          message: { mid: 'm', is_echo: true, quick_reply: { payload: 'reel:abc' } },
        }],
      }],
    }
    expect(parsearAviso(aviso).botones).toEqual([])
  })
})

describe('parsearAviso — robustez', () => {
  it('no explota con un cuerpo con otra forma', () => {
    // Meta cambia formatos sin avisar. Un parser que revienta tumba el webhook
    // entero y nos deja sin los avisos que SÍ entendemos.
    expect(parsearAviso({ cualquier: 'cosa' })).toEqual({ comentarios: [], botones: [] })
    expect(parsearAviso(null)).toEqual({ comentarios: [], botones: [] })
    expect(parsearAviso(undefined)).toEqual({ comentarios: [], botones: [] })
    expect(parsearAviso('un string')).toEqual({ comentarios: [], botones: [] })
    expect(parsearAviso({ entry: 'no es una lista' })).toEqual({ comentarios: [], botones: [] })
    expect(parsearAviso({ entry: [null, 5, { changes: null }] })).toEqual({ comentarios: [], botones: [] })
  })

  it('un aviso mezclado devuelve las dos cosas', () => {
    const aviso = {
      object: 'instagram',
      entry: [
        { id: 'x', changes: [{ field: 'comments', value: { id: 'c1', text: 'a', media: { id: 'm1' }, from: { id: 'u1' }, timestamp: 't' } }] },
        { id: 'y', messaging: [{ sender: { id: 'u2' }, message: { mid: 'm', quick_reply: { payload: 'reel:abc' } } }] },
      ],
    }
    const resultado = parsearAviso(aviso)
    expect(resultado.comentarios).toHaveLength(1)
    expect(resultado.botones).toHaveLength(1)
  })
})
