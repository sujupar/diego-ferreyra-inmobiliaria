import { describe, it, expect } from 'vitest'
import { faltanRespuestas, editadaAMano, bloqueoDePublicacion } from './answers-gate'

const preguntas = [{ id: 'q1' }, { id: 'q2' }]
const doc = (titular: string) => ({ blocks: [{ type: 'hero', props: { headline: titular } }] })

describe('faltanRespuestas', () => {
  it('sin preguntas no falta nada', () => {
    expect(faltanRespuestas({})).toEqual([])
    expect(faltanRespuestas({ questions: [] })).toEqual([])
  })
  it('una respuesta en blanco cuenta como faltante', () => {
    expect(faltanRespuestas({ questions: preguntas, answers: { q1: 'ok', q2: '   ' } })).toEqual(['q2'])
    expect(faltanRespuestas({ questions: preguntas, answers: {} })).toEqual(['q1', 'q2'])
  })
  it('todas respondidas', () => {
    expect(faltanRespuestas({ questions: preguntas, answers: { q1: 'a', q2: 'b' } })).toEqual([])
  })
})

describe('editadaAMano', () => {
  it('sin borrador, nadie escribió nada', () => {
    expect(editadaAMano({ content: doc('A'), draft_content: null })).toBe(false)
    expect(editadaAMano({ content: doc('A') })).toBe(false)
  })

  it('abrir el editor sin tocar nada NO cuenta como editar', () => {
    // El autosave guarda un borrador igual al contenido; eso no es escribir.
    expect(editadaAMano({ content: doc('A'), draft_content: doc('A') })).toBe(false)
  })

  it('un borrador con otro texto SÍ es edición a mano', () => {
    expect(editadaAMano({ content: doc('A'), draft_content: doc('B') })).toBe(true)
  })

  it('el mismo documento con las claves en otro orden no es una edición', () => {
    // El editor rearma el documento desde el registro de bloques: sin comparar
    // de forma estable, un orden distinto abriría el gate solo.
    const a = { blocks: [{ type: 'hero', props: { headline: 'X', sub: 'Y' } }] }
    const b = { blocks: [{ props: { sub: 'Y', headline: 'X' }, type: 'hero' }] }
    expect(editadaAMano({ content: a, draft_content: b })).toBe(false)
  })
})

describe('bloqueoDePublicacion', () => {
  it('el caso de Coghlan: landing escrita a mano SE PUBLICA aunque no haya respuestas', () => {
    // Era el encierro: landing afinada a mano, aprobada por el dueño, y el
    // sistema pedía responder preguntas que no se ven desde el editor. La
    // única salida ofrecida era borrarla y perder el trabajo.
    expect(bloqueoDePublicacion({
      published_at: null,
      wizard_state: { questions: preguntas, answers: {}, copyFromAnswers: false },
      content: doc('genérico'),
      draft_content: doc('Casa única en Coghlan'),
    })).toBeNull()
  })

  it('el camino de las respuestas también publica', () => {
    expect(bloqueoDePublicacion({
      published_at: null,
      wizard_state: { questions: preguntas, answers: { q1: 'a', q2: 'b' }, copyFromAnswers: true },
      content: doc('generado con respuestas'),
    })).toBeNull()
  })

  it('BLOQUEA el copy genérico intacto: sin respuestas y sin haber editado nada', () => {
    const motivo = bloqueoDePublicacion({
      published_at: null,
      wizard_state: { questions: preguntas, answers: {}, copyFromAnswers: false },
      content: doc('genérico'),
      draft_content: null,
    })
    expect(motivo).toMatch(/preguntas/i)
    // El mensaje tiene que decir DÓNDE están y cuál es la alternativa: sin eso
    // era un callejón sin salida desde el editor.
    expect(motivo).toMatch(/ficha de la propiedad/i)
    expect(motivo).toMatch(/editor/i)
  })

  it('responder sin generar los textos todavía bloquea', () => {
    expect(bloqueoDePublicacion({
      published_at: null,
      wizard_state: { questions: preguntas, answers: { q1: 'a', q2: 'b' }, copyFromAnswers: false },
      content: doc('genérico'),
    })).not.toBeNull()
  })

  it('una landing YA publicada re-publica cambios sin gate', () => {
    expect(bloqueoDePublicacion({
      published_at: '2026-08-01T00:00:00Z',
      wizard_state: { questions: preguntas, answers: {}, copyFromAnswers: false },
      content: doc('lo que sea'),
    })).toBeNull()
  })

  it('una landing legacy sin preguntas no se bloquea', () => {
    expect(bloqueoDePublicacion({ published_at: null, wizard_state: {}, content: doc('A') })).toBeNull()
    expect(bloqueoDePublicacion({ published_at: null, content: doc('A') })).toBeNull()
  })
})
