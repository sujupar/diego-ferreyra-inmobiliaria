import { describe, it, expect } from 'vitest'
import { armarDescripcionReel, type DatosDescripcion } from './descripcion'

const depto: DatosDescripcion = {
  property_type: 'departamento',
  operation_type: 'venta',
  neighborhood: 'Almagro',
  rooms: 3,
  bedrooms: 2,
  bathrooms: 1,
  garages: 1,
  covered_area: 78,
}

describe('armarDescripcionReel', () => {
  it('abre con el tipo capitalizado y el barrio', () => {
    const texto = armarDescripcionReel(depto, 'PROPIEDAD')
    expect(texto).toContain('Departamento')
    expect(texto).toContain('Almagro')
    // Nunca el tipo en minúscula cruda: pedido del dueño (2026-07-25).
    expect(texto).not.toContain('departamento en')
  })

  it('dice la operación en castellano', () => {
    expect(armarDescripcionReel(depto, 'info')).toContain('En venta')
    expect(armarDescripcionReel({ ...depto, operation_type: 'alquiler' }, 'info')).toContain('En alquiler')
  })

  it('termina con el llamado a la acción y la palabra en mayúsculas', () => {
    expect(armarDescripcionReel(depto, 'propiedad')).toMatch(/Comentá la palabra PROPIEDAD\b/)
  })

  it('usa la palabra tal como la escribió el asesor, en mayúsculas', () => {
    expect(armarDescripcionReel(depto, 'más info')).toContain('MÁS INFO')
  })

  it('NUNCA incluye un precio', () => {
    // Regla dura del pedido. El tipo DatosDescripcion no tiene campo de precio,
    // así que no hay ningún camino que lo escriba. Esta prueba existe para que
    // el día que alguien agregue "price" al tipo, tenga que venir acá y
    // decidirlo a conciencia en vez de que se cuele solo.
    const texto = armarDescripcionReel(depto, 'propiedad')
    expect(texto).not.toMatch(/\$|USD|U\$S|\d{3}\.\d{3}/)
  })

  it('arma la ficha de ambientes con los datos que hay', () => {
    const texto = armarDescripcionReel(depto, 'info')
    expect(texto).toContain('3 ambientes')
    expect(texto).toContain('2 dormitorios')
    expect(texto).toContain('78 m²')
  })

  it('omite lo que no está en vez de dejar huecos', () => {
    const texto = armarDescripcionReel({ property_type: 'casa', neighborhood: 'Flores' }, 'info')
    expect(texto).not.toContain('undefined')
    expect(texto).not.toContain('null')
    expect(texto).not.toContain('NaN')
  })

  it('sin barrio no escribe la palabra "en" colgada', () => {
    const texto = armarDescripcionReel({ property_type: 'ph', neighborhood: null }, 'info')
    expect(texto).not.toMatch(/\ben\s*$/m)
    expect(texto).toContain('PH')
  })

  it('pone el singular cuando corresponde', () => {
    const texto = armarDescripcionReel({ ...depto, bedrooms: 1, bathrooms: 1, garages: 1 }, 'info')
    expect(texto).toContain('1 dormitorio')
    expect(texto).not.toContain('1 dormitorios')
    expect(texto).toContain('1 baño')
    expect(texto).not.toContain('1 baños')
    expect(texto).toContain('1 cochera')
    expect(texto).not.toContain('1 cocheras')
  })

  it('suma las comodidades cuando están', () => {
    const texto = armarDescripcionReel({ ...depto, amenities: ['Pileta', 'SUM'] }, 'info')
    expect(texto).toContain('Pileta')
    expect(texto).toContain('SUM')
  })

  it('no rompe con una propiedad casi vacía', () => {
    // Sin ningún dato cargado igual tiene que salir algo publicable: el llamado
    // a la acción es lo único imprescindible, porque es lo que hace funcionar
    // toda la automatización que viene después.
    const texto = armarDescripcionReel({}, 'info')
    expect(texto).toContain('Comentá la palabra INFO')
    expect(texto).toContain('Propiedad')
    expect(texto).not.toContain('undefined')
    expect(texto).not.toContain('null')
  })

  it('sin palabra no inventa un llamado a la acción vacío', () => {
    const texto = armarDescripcionReel(depto, '')
    expect(texto).not.toMatch(/Comentá la palabra\s*$/m)
  })

  it('no deja líneas en blanco de más ni espacios al final', () => {
    const texto = armarDescripcionReel(depto, 'info')
    expect(texto).not.toMatch(/\n{3,}/)
    expect(texto).toBe(texto.trim())
  })
})
