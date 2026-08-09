import { describe, it, expect } from 'vitest'
import {
  buildKeyStats, heroLayout, visibleTabs, resolveTab,
  ghlMissingFields, nextStep, operationLabel, propertyTypeLabel, formatMoney,
} from './detail-view'

describe('buildKeyStats', () => {
  it('solo devuelve los datos que existen, en orden', () => {
    const stats = buildKeyStats({ rooms: 3, bedrooms: 2, bathrooms: null, covered_area: 78, total_area: 92 })
    expect(stats.map(s => s.key)).toEqual(['rooms', 'bedrooms', 'covered_area', 'total_area'])
    expect(stats[2].value).toBe('78 m²')
  })

  it('trata el piso 0 como PB (y no lo descarta por ser falsy)', () => {
    expect(buildKeyStats({ floor: 0 })).toEqual([{ key: 'floor', label: 'Piso', value: 'PB' }])
    expect(buildKeyStats({ floor: 4 })[0].value).toBe('4º')
  })

  it('singulariza la antigüedad y formatea expensas en pesos', () => {
    expect(buildKeyStats({ age: 1 })[0].value).toBe('1 año')
    expect(buildKeyStats({ age: 12 })[0].value).toBe('12 años')
    expect(buildKeyStats({ expensas: 145000 })[0].value).toContain('145.000')
  })

  it('con la propiedad vacía no devuelve nada', () => {
    expect(buildKeyStats({})).toEqual([])
  })
})

describe('heroLayout', () => {
  it('una sola foto ocupa todo el ancho y no tiene miniaturas', () => {
    expect(heroLayout(1)).toEqual({ grid: 'grid-cols-1', cover: '', thumbs: 0 })
  })
  it('con 3 fotos deja 2 miniaturas y con 5 o más, 4', () => {
    expect(heroLayout(3).thumbs).toBe(2)
    expect(heroLayout(5).thumbs).toBe(4)
    expect(heroLayout(22).thumbs).toBe(4)
  })
  it('nunca pide más miniaturas que fotos disponibles', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 20]) {
      expect(heroLayout(n).thumbs).toBeLessThanOrEqual(Math.max(0, n - 1))
    }
  })
})

describe('visibleTabs / resolveTab', () => {
  it('el asesor con propiedad captada ve las cinco', () => {
    expect(visibleTabs({ role: 'asesor', status: 'approved' }))
      .toEqual(['propiedad', 'multimedia', 'documentacion', 'difusion', 'historial'])
  })
  it('sin captar todavía, no hay Difusión', () => {
    expect(visibleTabs({ role: 'asesor', status: 'pending_docs' })).not.toContain('difusion')
  })
  it('el abogado no ve Multimedia ni Difusión', () => {
    expect(visibleTabs({ role: 'abogado', status: 'approved' }))
      .toEqual(['propiedad', 'documentacion', 'historial'])
  })
  it('resuelve la pestaña de la URL y cae en Propiedad si no corresponde', () => {
    const visibles = visibleTabs({ role: 'abogado', status: 'approved' })
    expect(resolveTab('documentacion', visibles)).toBe('documentacion')
    expect(resolveTab('difusion', visibles)).toBe('propiedad')
    expect(resolveTab(null, visibles)).toBe('propiedad')
    expect(resolveTab('cualquier-cosa', visibles)).toBe('propiedad')
  })
})

describe('ghlMissingFields', () => {
  it('detecta los placeholders de importación como faltantes', () => {
    const missing = ghlMissingFields({
      address: '[Importado GHL] sin dirección', neighborhood: '[PENDIENTE]',
      asking_price: 0, commission_percentage: 3, covered_area: 50, total_area: 60, photos: [],
    })
    expect(missing).toEqual(['dirección', 'barrio', 'precio de venta', 'fotos'])
  })
  it('con todo cargado no falta nada', () => {
    expect(ghlMissingFields({
      address: 'Rivadavia 4820', neighborhood: 'Caballito', asking_price: 185000,
      commission_percentage: 3, covered_area: 78, total_area: 92, photos: ['a.jpg'],
    })).toEqual([])
  })
})

describe('nextStep', () => {
  const base = {
    role: 'asesor', status: 'approved', legalStatus: 'approved', legalNotes: null,
    legalSubmittedAt: '2026-08-01T10:00:00Z',
    photosCount: 5, documentsCount: 3, ghlImported: false, ghlMissing: [],
    importSource: null, legalDocsPending: false, originPending: false,
  }

  it('propiedad sana y captada: no muestra nada', () => {
    expect(nextStep(base)).toBeNull()
  })

  it('rechazo legal gana sobre todo lo demás y muestra las observaciones', () => {
    const s = nextStep({ ...base, legalStatus: 'rejected', legalNotes: 'Escritura vencida', ghlImported: true, ghlMissing: ['fotos'] })
    expect(s?.id).toBe('legal-rejected')
    expect(s?.tone).toBe('danger')
    expect(s?.text).toBe('Escritura vencida')
    expect(s?.action).toEqual({ kind: 'tab', tab: 'documentacion', label: 'Ver observaciones' })
  })

  /* ---- la documentación dejó de bloquear (2026-08-09) ---- */

  it('captada con documentación cargada y sin enviar: recordatorio INFORMATIVO, no una traba', () => {
    const s = nextStep({ ...base, legalStatus: 'pending', legalSubmittedAt: null, documentsCount: 2 })
    expect(s?.id).toBe('submit')
    expect(s?.tone).toBe('info')
    expect(s?.text).toContain('ya está captada')
    expect(s?.action).toEqual({ kind: 'submit-review', label: 'Enviar a Revisión Legal' })
  })

  it('captada sin ningún documento: el aviso NO dice que falta algo obligatorio', () => {
    const s = nextStep({ ...base, legalStatus: 'pending', legalSubmittedAt: null, documentsCount: 0 })
    expect(s?.id).toBe('docs')
    expect(s?.tone).toBe('info')
    expect(s?.title).not.toMatch(/falta/i)
    expect(s?.text).toContain('no es obligatoria')
    expect(s?.action).toEqual({ kind: 'tab', tab: 'documentacion', label: 'Ir a Documentación' })
  })

  // El aviso de fotos aparece justamente cuando el asesor ya está mirando la
  // ficha, muchas veces parado en Multimedia: cambiarlo de pestaña no le
  // resuelve nada. La acción abre el selector de archivos ahí mismo.
  it('sin fotos: ofrece subirlas, no cambiar de pestaña — y son lo ÚNICO que bloquea', () => {
    const s = nextStep({ ...base, status: 'pending_photos', photosCount: 0 })
    expect(s?.id).toBe('photos')
    expect(s?.action).toEqual({ kind: 'subir-fotos', label: 'Subir fotos' })
  })

  it('sin fotos y sin documentación, el aviso que gana es el de las fotos', () => {
    const s = nextStep({ ...base, status: 'pending_docs', legalStatus: 'pending', legalSubmittedAt: null, photosCount: 0, documentsCount: 0 })
    expect(s?.id).toBe('photos')
    expect(s?.text).toContain('no es obligatoria')
  })

  it('al abogado nunca le ofrece subir fotos ni enviar a revisión', () => {
    const s = nextStep({ ...base, role: 'abogado', status: 'pending_photos', photosCount: 0 })
    expect(s?.action).toBeNull()
    // Y sin nada suyo pendiente, tampoco le muestra el recordatorio del asesor.
    expect(nextStep({ ...base, role: 'abogado', legalStatus: 'pending', legalSubmittedAt: null })).toBeNull()
  })

  /* ---- el carril legal ya no se lee de `status` ---- */

  it('al abogado con la documentación enviada le ofrece revisar, aunque la propiedad ya esté captada', () => {
    const s = nextStep({ ...base, role: 'abogado', status: 'approved', legalStatus: 'pending' })
    expect(s?.id).toBe('legal-todo')
    expect(s?.action).toEqual({ kind: 'tab', tab: 'documentacion', label: 'Revisar documentación' })
  })

  it('al asesor con revisión en curso solo le informa — y le aclara que igual puede difundir', () => {
    const s = nextStep({ ...base, status: 'approved', legalStatus: 'pending' })
    expect(s?.id).toBe('legal-waiting')
    expect(s?.text).toContain('se puede difundir')
    expect(s?.action).toBeNull()
  })

  // El recordatorio AFIRMA que la propiedad está captada. Sobre una rechazada
  // (que llega con fotos hasta el final de la cadena) estaría mintiendo.
  it('no le dice "ya está captada" a una propiedad rechazada', () => {
    const s = nextStep({ ...base, status: 'rejected', legalStatus: 'pending', legalSubmittedAt: null, documentsCount: 0 })
    // Sin aviso, no un aviso que afirme algo falso.
    expect(s).toBeNull()
  })

  it('sin `legalSubmittedAt` no hay revisión en curso: el status viejo ya no la inventa', () => {
    const s = nextStep({ ...base, status: 'pending_review', legalStatus: 'pending', legalSubmittedAt: null })
    expect(s?.id).not.toBe('legal-waiting')
  })

  it('la descartada avisa que está fuera del flujo', () => {
    expect(nextStep({ ...base, status: 'descartada' })?.id).toBe('descartada')
  })

  it('la importada por CSV con archivos pendientes manda a Documentación', () => {
    const s = nextStep({ ...base, importSource: 'csv_precaptada', legalDocsPending: true })
    expect(s?.id).toBe('precaptada')
    expect(s?.action).toEqual({ kind: 'tab', tab: 'documentacion', label: 'Ir a Documentación' })
  })
})

describe('etiquetas', () => {
  it('arma el ojo de aguja de la operación', () => {
    expect(operationLabel('venta')).toBe('en venta')
    expect(operationLabel('alquiler')).toBe('en alquiler')
    expect(operationLabel('alquiler_temporario')).toBe('en alquiler temporario')
    // El valor CANÓNICO de la columna. Caía en el default y la ficha decía
    // "en venta" para un alquiler temporario.
    expect(operationLabel('temporario')).toBe('en alquiler temporario')
    expect(operationLabel(null)).toBe('en venta')
  })
  it('capitaliza el tipo y respeta PH', () => {
    expect(propertyTypeLabel('departamento')).toBe('Departamento')
    expect(propertyTypeLabel('ph')).toBe('PH')
    expect(propertyTypeLabel(null)).toBe('Propiedad')
  })
  it('formatea precios sin decimales', () => {
    expect(formatMoney(185000, 'USD')).toContain('185.000')
    expect(formatMoney(185000, 'USD')).not.toContain(',00')
  })
})
