/**
 * D28 — desde el asistente, la casilla «Guardar este orden en la propiedad»
 * (Vista previa PDF → Organizar) estaba SIEMPRE en gris, con el cartel «(solo
 * disponible en tasaciones guardadas)» encima de una tasación que sí estaba
 * guardada. La causa era una prop olvidada: el asistente montaba
 * `<PDFPreviewModal>` sin `appraisalId`, aunque el id estaba a mano (`editId` en
 * la URL, `savedAppraisalId` tras el primer guardado). La ficha
 * (`appraisals/[id]`) sí la pasa, y ahí la casilla funciona.
 *
 * Este chequeo es de FUENTE a propósito: el asistente son ~1700 líneas con
 * `dynamic()`, PDF y Supabase adentro, y montarlo entero para verificar el paso
 * de una prop costaría más de lo que prueba. Lo que sí prueba es exactamente lo
 * que se rompió —y lo que se rompería de nuevo si alguien mueve ese bloque—:
 * que el modal recibe un id. El comportamiento de la casilla con id presente ya
 * está cubierto por el camino de la ficha, que usa el mismo componente.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const asistente = readFileSync(
  path.join(process.cwd(), 'app/(dashboard)/appraisal/new/page.tsx'),
  'utf8',
)
const modal = readFileSync(
  path.join(process.cwd(), 'components/appraisal/PDFPreviewModal.tsx'),
  'utf8',
)

/** El bloque JSX donde el asistente monta el modal (no el `dynamic(import)`). */
function bloqueDelModal(): string {
  const desde = asistente.indexOf('<PDFPreviewModal')
  expect(desde).toBeGreaterThan(-1)
  const resto = asistente.slice(desde)
  const hasta = resto.indexOf('/>')
  expect(hasta).toBeGreaterThan(-1)
  return resto.slice(0, hasta)
}

describe('El asistente le pasa el id de la tasación al modal del PDF (D28)', () => {
  it('el `<PDFPreviewModal>` del asistente lleva `appraisalId`', () => {
    expect(bloqueDelModal()).toMatch(/appraisalId=\{/)
  })

  it('el id sale de la URL o del primer guardado de la sesión', () => {
    const bloque = bloqueDelModal()
    expect(bloque).toContain('editId')
    expect(bloque).toContain('savedAppraisalId')
  })

  it('la casilla del modal sigue dependiendo de esa prop — por eso hay que pasarla', () => {
    // Si este caso se pone rojo, el modal cambió su forma de gatear la casilla
    // y hay que revisar si `appraisalId` sigue siendo lo que la habilita.
    expect(modal).toContain('disabled={!appraisalId}')
  })
})
