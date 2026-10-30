import { describe, expect, it } from 'vitest'
import { crearTurno } from './turno'

describe('crearTurno', () => {
  it('corre los trabajos de a uno aunque se pidan a la vez', async () => {
    const turno = crearTurno()
    let enCurso = 0
    let maximo = 0
    const trabajo = () =>
      turno(async () => {
        enCurso++
        maximo = Math.max(maximo, enCurso)
        await new Promise((r) => setTimeout(r, 5))
        enCurso--
      })
    await Promise.all([trabajo(), trabajo(), trabajo()])
    expect(maximo).toBe(1)
  })

  it('un trabajo que falla no traba a los siguientes', async () => {
    const turno = crearTurno()
    await expect(turno(async () => Promise.reject(new Error('x')))).rejects.toThrow('x')
    await expect(turno(async () => 7)).resolves.toBe(7)
  })
})
