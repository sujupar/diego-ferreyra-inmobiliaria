import { describe, expect, it } from 'vitest'
import { leerComentariosDePagina } from './webhook'

const PAGINA = '103823292484521'
const POST = `${PAGINA}_1092248110314200`

function aviso(valor: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    object: 'page',
    entry: [{ id: PAGINA, time: 1793800000, changes: [{ field: 'feed', value: valor }], ...extra }],
  }
}

const comentario = {
  from: { id: '7788', name: 'Ana Pérez' },
  post_id: POST,
  comment_id: '1092248110314200_555',
  message: 'Info por favor',
  created_time: 1793800123,
  item: 'comment',
  verb: 'add',
  parent_id: POST,
}

describe('leerComentariosDePagina', () => {
  it('lee un comentario nuevo de un reel de la Página', () => {
    expect(leerComentariosDePagina(aviso(comentario))).toEqual([
      {
        plataforma: 'facebook',
        igMediaId: POST,
        comentarioId: '1092248110314200_555',
        autorId: '7788',
        username: null,
        texto: 'Info por favor',
        creadoEn: new Date(1793800123 * 1000).toISOString(),
      },
    ])
  })

  it('sin hora en el comentario usa la del aviso', () => {
    const { created_time: _, ...sinHora } = comentario
    void _
    expect(leerComentariosDePagina(aviso(sinHora))[0].creadoEn).toBe(new Date(1793800000 * 1000).toISOString())
  })

  it('ignora comentarios editados o borrados, y lo que no es un comentario', () => {
    expect(leerComentariosDePagina(aviso({ ...comentario, verb: 'edited' }))).toEqual([])
    expect(leerComentariosDePagina(aviso({ ...comentario, verb: 'remove' }))).toEqual([])
    expect(leerComentariosDePagina(aviso({ ...comentario, item: 'reaction' }))).toEqual([])
    expect(leerComentariosDePagina(aviso({ ...comentario, item: 'status' }))).toEqual([])
  })

  it('sin autor, sin comentario o sin publicación no se puede contestar', () => {
    expect(leerComentariosDePagina(aviso({ ...comentario, from: undefined }))).toEqual([])
    expect(leerComentariosDePagina(aviso({ ...comentario, comment_id: undefined }))).toEqual([])
    expect(leerComentariosDePagina(aviso({ ...comentario, post_id: undefined }))).toEqual([])
  })

  it('un aviso de Instagram o basura no produce nada y no explota', () => {
    expect(leerComentariosDePagina({ object: 'instagram', entry: [{ changes: [{ field: 'comments', value: {} }] }] })).toEqual([])
    expect(leerComentariosDePagina(null)).toEqual([])
    expect(leerComentariosDePagina({ object: 'page', entry: 'no' })).toEqual([])
    expect(leerComentariosDePagina(aviso({ ...comentario, created_time: 'ayer' }))[0].creadoEn).toBe(
      new Date(1793800000 * 1000).toISOString(),
    )
  })
})
