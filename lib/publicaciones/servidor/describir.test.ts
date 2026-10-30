import { describe, expect, it } from 'vitest'
import { segmentosDeWhisper, tieneVoz } from './transcribir'
import { aplicarResultadoDescripcion, promptDescripcion, quitarFrasesConProblemas } from './describir'

const WHISPER = {
  task: 'transcribe',
  language: 'spanish',
  duration: 6.5,
  text: 'Hola a todos. Hoy les cuento cómo tasar.',
  segments: [
    { id: 0, seek: 0, start: 0, end: 3.2, text: ' Hola a todos.', tokens: [1], temperature: 0, avg_logprob: -0.2 },
    { id: 1, seek: 0, start: 3.2, end: 6.5, text: ' Hoy les cuento cómo tasar.', tokens: [2], temperature: 0, avg_logprob: -0.2 },
  ],
}

describe('segmentosDeWhisper', () => {
  it('convierte la respuesta verbose_json en segmentos', () => {
    expect(segmentosDeWhisper(WHISPER)).toEqual([
      { inicio: 0, fin: 3.2, texto: 'Hola a todos.' },
      { inicio: 3.2, fin: 6.5, texto: 'Hoy les cuento cómo tasar.' },
    ])
  })

  it('sin segments devuelve lista vacía', () => {
    expect(segmentosDeWhisper({ text: '' })).toEqual([])
    expect(segmentosDeWhisper(null)).toEqual([])
  })
})

describe('tieneVoz', () => {
  it('una transcripción vacía no tiene voz', () => {
    expect(tieneVoz([])).toBe(false)
  })

  it('las alucinaciones típicas sobre música no cuentan como voz', () => {
    expect(tieneVoz([{ inicio: 0, fin: 5, texto: '¡Gracias por ver!' }])).toBe(false)
    expect(tieneVoz([{ inicio: 0, fin: 5, texto: '[Música]' }])).toBe(false)
    expect(tieneVoz([{ inicio: 0, fin: 5, texto: 'Subtítulos realizados por la comunidad de Amara.org' }])).toBe(false)
  })

  it('una frase real tiene voz', () => {
    expect(tieneVoz(segmentosDeWhisper(WHISPER))).toBe(true)
  })
})

describe('aplicarResultadoDescripcion', () => {
  const ia = { descripcion: 'Descripción de la IA', titulo_youtube: 'Título de la IA' }

  const base = { descripcion: '', descripcion_editada: false, titulo_youtube: '', titulo_editado: false }

  it('sin edición usa lo de la IA', () => {
    expect(aplicarResultadoDescripcion(base, ia)).toEqual(ia)
  })

  it('con descripción editada conserva la descripción y completa el título', () => {
    expect(
      aplicarResultadoDescripcion({ ...base, descripcion: 'La escribí yo', descripcion_editada: true }, ia),
    ).toEqual({ descripcion: 'La escribí yo', titulo_youtube: 'Título de la IA' })
  })

  it('un título escrito por la persona gana aunque la descripción no esté editada', () => {
    expect(aplicarResultadoDescripcion({ ...base, titulo_youtube: 'Mío', titulo_editado: true }, ia)).toEqual({
      descripcion: 'Descripción de la IA',
      titulo_youtube: 'Mío',
    })
  })

  it('un título que la persona vació a propósito queda vacío', () => {
    expect(aplicarResultadoDescripcion({ ...base, titulo_editado: true }, ia).titulo_youtube).toBe('')
  })
})

describe('promptDescripcion', () => {
  it('con 100 ejemplos usa 30', () => {
    const ejemplos = Array.from({ length: 100 }, (_, i) => `ejemplo-numero-${i + 1}`)
    const { system, user } = promptDescripcion(segmentosDeWhisper(WHISPER), 'GUIA DE ESTILO', ejemplos)
    const todo = system + user
    expect(todo.match(/ejemplo-numero-\d+/g)).toHaveLength(30)
    expect(todo).toContain('ejemplo-numero-1')
    expect(todo).not.toContain('ejemplo-numero-31')
    expect(todo).toContain('GUIA DE ESTILO')
  })

  it('incluye la transcripción con tiempos', () => {
    const { user } = promptDescripcion(segmentosDeWhisper(WHISPER), 'g', [])
    expect(user).toContain('[0:03] Hoy les cuento cómo tasar.')
  })
})

describe('quitarFrasesConProblemas', () => {
  it('saca la frase que tiene el precio inventado y deja el resto', () => {
    expect(
      quitarFrasesConProblemas('Mirá esto. Sale U$D 150.000 en Palermo. ¿Qué opinás?', [
        'precio que no dijo Diego: U$D 150.000',
      ]),
    ).toBe('Mirá esto. ¿Qué opinás?')
  })

  it('respeta los saltos de línea', () => {
    expect(
      quitarFrasesConProblemas('Primera línea.\nLlamá al 11 5555-1234.\n\n#tasacion', [
        'teléfono que no dijo Diego: 11 5555-1234',
      ]),
    ).toBe('Primera línea.\n\n#tasacion')
  })
})
