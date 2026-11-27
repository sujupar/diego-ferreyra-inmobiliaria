import { describe, expect, it } from 'vitest'
import { enlaceDeTarea } from './enlace'

const base = { type: 'follow_up', source_activity_id: null, contact_id: null, deal_id: null, appraisal_id: null, property_id: null }

describe('enlaceDeTarea (la misma regla que tenía /tasks)', () => {
  it('cadencia → ficha', () => {
    expect(enlaceDeTarea({ ...base, source_activity_id: 'a1', contact_id: 'c1', deal_id: 'd1' })).toBe('/contacts/c1')
  })
  it('actualizar contacto → editor', () => {
    expect(enlaceDeTarea({ ...base, type: 'update_contact', deal_id: 'd1', contact_id: 'c1' })).toBe('/pipeline/d1?editContact=1')
    expect(enlaceDeTarea({ ...base, type: 'update_contact', appraisal_id: 'a1' })).toBe('/appraisals/a1?editContact=1')
    expect(enlaceDeTarea({ ...base, type: 'update_contact', contact_id: 'c1' })).toBe('/contacts/c1?edit=1')
    expect(enlaceDeTarea({ ...base, type: 'update_contact' })).toBe('#')
  })
  it('informe → pestaña informes; el resto por entidad', () => {
    expect(enlaceDeTarea({ ...base, type: 'informe_quincenal', property_id: 'p1' })).toBe('/properties/p1?tab=informes')
    expect(enlaceDeTarea({ ...base, deal_id: 'd1', property_id: 'p1' })).toBe('/pipeline/d1')
    expect(enlaceDeTarea({ ...base, property_id: 'p1' })).toBe('/properties/p1')
    expect(enlaceDeTarea({ ...base, appraisal_id: 'a1' })).toBe('/appraisals/a1')
    expect(enlaceDeTarea({ ...base, contact_id: 'c1' })).toBe('/contacts/c1')
    expect(enlaceDeTarea(base)).toBe('#')
  })
})
