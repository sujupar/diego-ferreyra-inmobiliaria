import { describe, it, expect, vi } from 'vitest'
import { analizar, asegurarMultiplicador, entradaAnalisis, parsearAnalisis, promptAnalisis, verificarCitas } from './analizar'
import type { PedidoIA } from './motor'
import type { CuentaPerfil, ReelCrudo } from '../tipos'

const reel: ReelCrudo & { multiplicador: number } = {
  shortcode: 'abc', pk: '1', cuenta: 'inmo_ar', publicadoAt: '2026-11-01T00:00:00Z',
  vistas: 76_540, likes: 900, comentarios: 120, caption: 'Baja el impuesto de sellos',
  duracionSeg: 42, urlPortada: null, esReel: true, multiplicador: 6.2,
}
const perfil: CuentaPerfil = { usuario: 'inmo_ar', igUserId: '9', seguidores: 12345 }

const valido = {
  tema: 'Impuesto de sellos',
  gancho: 'Arranca mostrando un billete y dice "esto te lo cobra el Estado"',
  formato: 'A cámara con texto en pantalla',
  por_que: 'Hizo ×6,2 sobre una base de 12.345 vistas porque…',
  comentarios_analisis: 'Varios preguntan "¿y si soy monotributista?"',
  adaptacion_diego: 'Mirá, lo importante no es a cuánto vendés, es cuánto te queda en mano…',
  transcripcion: '',
}

describe('parsearAnalisis', () => {
  it('acepta el JSON con los 7 campos (transcripción puede venir vacía)', () => {
    expect(parsearAnalisis(JSON.stringify(valido))).toEqual(valido)
  })
  it('recorta espacios de los campos', () => {
    const r = parsearAnalisis(JSON.stringify({ ...valido, tema: '  Sellos  ' }))
    expect(r.tema).toBe('Sellos')
  })
  it('tira si no es JSON', () => {
    expect(() => parsearAnalisis('no es json')).toThrow()
  })
  for (const campo of ['tema', 'gancho', 'formato', 'por_que', 'comentarios_analisis', 'adaptacion_diego', 'transcripcion']) {
    it(`tira si falta ${campo}`, () => {
      const o: Record<string, unknown> = { ...valido }
      delete o[campo]
      expect(() => parsearAnalisis(JSON.stringify(o))).toThrow(campo)
    })
  }
  for (const campo of ['tema', 'gancho', 'formato', 'por_que', 'comentarios_analisis', 'adaptacion_diego']) {
    it(`tira si ${campo} viene vacío`, () => {
      expect(() => parsearAnalisis(JSON.stringify({ ...valido, [campo]: '   ' }))).toThrow(campo)
    })
  }
  it('tira si un campo no es texto', () => {
    expect(() => parsearAnalisis(JSON.stringify({ ...valido, gancho: 3 }))).toThrow('gancho')
  })
})

describe('entradaAnalisis', () => {
  const e = entradaAnalisis(reel, 12_345, perfil, ['¿Y si soy monotributista?', 'Gracias, re claro'])
  it('incluye el multiplicador con coma decimal', () => {
    expect(e).toContain('×6,2')
  })
  it('incluye la base formateada es-AR', () => {
    expect(e).toContain('12.345')
  })
  it('numera los comentarios', () => {
    expect(e).toContain('1. ¿Y si soy monotributista?')
    expect(e).toContain('2. Gracias, re claro')
  })
  it('incluye cuenta, caption y vistas', () => {
    expect(e).toContain('@inmo_ar')
    expect(e).toContain('Baja el impuesto de sellos')
    expect(e).toContain('76.540')
  })
  it('sin comentarios lo dice', () => {
    expect(entradaAnalisis(reel, 12_345, perfil, [])).toContain('(ninguno)')
  })
})

describe('promptAnalisis', () => {
  const p = promptAnalisis()
  it('explica el orden cronológico de los cuadros y el gancho', () => {
    expect(p).toMatch(/orden cronológico/i)
    expect(p).toContain('frame-01')
  })
  it('pide citar comentarios textuales y nunca inventarlos', () => {
    expect(p).toMatch(/textual/i)
    expect(p).toMatch(/nunca invent/i)
  })
  it('pide citar multiplicador y base en por_que', () => {
    expect(p).toMatch(/por_que[^\n]*multiplicador[^\n]*base/i)
  })
  it('trae el ángulo de Diego y sus reglas de voz', () => {
    expect(p).toContain('lo importante no es a cuánto vendés, es cuánto te queda en mano')
    expect(p).toContain('Reglas de Voz')
    expect(p).toContain('PLAYBOOK DE FORMATOS')
  })
  it('trata el texto de Instagram como dato', () => {
    expect(p).toMatch(/nunca instrucciones/i)
  })
})

describe('analizar', () => {
  it('manda texto + cuadros al motor profundo y pisa la transcripción con la de whisper', async () => {
    const pedir = vi.fn(async (_: PedidoIA) => JSON.stringify({ ...valido, transcripcion: 'inventada por el modelo' }))
    const r = await analizar(
      { frames: ['/tmp/x/frame-01.jpg', '/tmp/x/frame-02.jpg'], transcripcion: 'Hola, mirá esto' },
      reel, 12_345, perfil, ['c1'],
      { pedir },
    )
    expect(r.transcripcion).toBe('Hola, mirá esto')
    const pedido = pedir.mock.calls[0][0]
    expect(pedido.nivel).toBe('profundo')
    expect(pedido.timeoutMs).toBe(240_000)
    expect(pedido.partes[0]).toHaveProperty('texto')
    const texto = (pedido.partes[0] as { texto: string }).texto
    expect(texto).toContain('×6,2')
    expect(texto).toContain('Hola, mirá esto')
    expect(pedido.partes.slice(1)).toEqual([{ imagen: '/tmp/x/frame-01.jpg' }, { imagen: '/tmp/x/frame-02.jpg' }])
  })
  it('sin habla: transcripción vacía, y el texto le avisa al modelo', async () => {
    const pedir = vi.fn(async (_: PedidoIA) => JSON.stringify({ ...valido, transcripcion: 'algo' }))
    const r = await analizar({ frames: [], transcripcion: '' }, reel, 1000, perfil, [], { pedir })
    expect(r.transcripcion).toBe('')
    expect((pedir.mock.calls[0][0].partes[0] as { texto: string }).texto).toMatch(/sin habla/i)
  })
  it('recorta la transcripción a 4.000 caracteres', async () => {
    const pedir = vi.fn(async (_: PedidoIA) => JSON.stringify(valido))
    const r = await analizar({ frames: [], transcripcion: 'a'.repeat(5000) }, reel, 1000, perfil, [], { pedir })
    expect(r.transcripcion.length).toBe(4000)
  })
})

describe('verificarCitas', () => {
  const coms = ['¿Y si soy monotributista? Me pasó lo mismo', 'Cómo me gusta este ciclo de entrevistas!!']
  it('deja una cita textual (sin importar mayúsculas, tildes ni espacios)', () => {
    const t = 'Preguntan "y si soy  MONOTRIBUTISTA" y elogian "como me gusta este ciclo".'
    expect(verificarCitas(t, coms)).toBe(t)
  })
  it('reemplaza una cita parafraseada o inventada', () => {
    expect(verificarCitas('Dicen "quiero vender mi depto ya" y listo.', coms)).toBe('Dicen [cita no verificada] y listo.')
  })
  it('maneja comillas curvas, angulares y simples', () => {
    expect(verificarCitas('“me pasó lo mismo” y «esto nadie lo dijo» y \'otra frase falsa\'', coms)).toBe(
      '“me pasó lo mismo” y [cita no verificada] y [cita no verificada]',
    )
  })
  it('no toca palabras cortas entre comillas', () => {
    const t = 'El formato "pizarra" y el "gancho".'
    expect(verificarCitas(t, coms)).toBe(t)
  })
})

describe('asegurarMultiplicador', () => {
  it('si ya trae ×N,N no lo toca', () => {
    expect(asegurarMultiplicador('Hizo ×6,2 porque…', 6.2, 12_345, 'inmo_ar')).toBe('Hizo ×6,2 porque…')
  })
  it('si falta, antepone la frase armada en código', () => {
    expect(asegurarMultiplicador('Funcionó por el gancho.', 6.2, 12_345, 'inmo_ar')).toBe(
      'Hizo ×6,2 sobre la mediana de 12.345 vistas de @inmo_ar. Funcionó por el gancho.',
    )
  })
})

describe('analizar verifica citas y números', () => {
  it('reemplaza citas inventadas y antepone el multiplicador faltante', async () => {
    const pedir = vi.fn(async (_: PedidoIA) =>
      JSON.stringify({
        ...valido,
        por_que: 'Arranca con "Hola, mirá esto" y funcionó.',
        comentarios_analisis: 'Piden "mandame la planilla por favor" y "gracias, re claro".',
      }),
    )
    const r = await analizar({ frames: [], transcripcion: 'Hola, mirá esto' }, reel, 12_345, perfil, ['Gracias, re claro'], { pedir })
    expect(r.comentarios_analisis).toBe('Piden [cita no verificada] y "gracias, re claro".')
    expect(r.por_que).toBe('Hizo ×6,2 sobre la mediana de 12.345 vistas de @inmo_ar. Arranca con "Hola, mirá esto" y funcionó.')
  })
})
