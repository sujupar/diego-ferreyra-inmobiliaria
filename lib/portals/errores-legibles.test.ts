import { describe, it, expect } from 'vitest'
import {
  explicarErrorHttp,
  explicarErrorArgenprop,
  recortarDetalle,
  ocultarImagenesIncrustadas,
  LARGO_MAXIMO_DETALLE,
} from './errores-legibles'

const BASE64 = 'data:image/png;base64,' + 'iVBORw0KGgoAAAANSUhEUg'.repeat(50)

describe('explicarErrorHttp', () => {
  it('413 → el aviso es demasiado pesado, con la pista de la foto incrustada', () => {
    const t = explicarErrorHttp('MercadoLibre', 413)
    expect(t).toMatch(/demasiado pesado/i)
    expect(t).toMatch(/imagen incrustada/i)
    expect(t).toMatch(/Multimedia/)
  })
  it('401/403 → credenciales; 429 → límite; 5xx → problema del portal', () => {
    expect(explicarErrorHttp('Argenprop', 401)).toMatch(/credenciales/i)
    expect(explicarErrorHttp('Argenprop', 403)).toMatch(/credenciales/i)
    expect(explicarErrorHttp('Argenprop', 429)).toMatch(/reintent/i)
    expect(explicarErrorHttp('MercadoLibre', 502)).toMatch(/de su lado/i)
  })
  it('otro código → genérico con el número, nunca HTML', () => {
    const t = explicarErrorHttp('MercadoLibre', 418)
    expect(t).toMatch(/418/)
    expect(t).not.toMatch(/</)
  })
})

describe('explicarErrorArgenprop', () => {
  it('el caso real: Multimedia.Url con un base64 adentro', () => {
    const cuerpo = JSON.stringify({
      ErrorCode: 'PUB001',
      Detail: 'Error de validación',
      Errors: { 'Multimedia.Url': `Valor inválido: ${BASE64}` },
    })
    const t = explicarErrorArgenprop(400, cuerpo)
    expect(t).toMatch(/foto|video/i)
    expect(t).toMatch(/imagen incrustada/i)
    expect(t).not.toMatch(/base64|iVBOR/)
    expect(t.length).toBeLessThan(400)
  })

  it('traduce los campos conocidos', () => {
    const cuerpo = JSON.stringify({
      ErrorCode: 'PUB001', Detail: 'x',
      Errors: { Titulo: 'muy largo', Precio: 'inválido', 'Localizacion.Calle': 'falta' },
    })
    const t = explicarErrorArgenprop(400, cuerpo)
    expect(t).toMatch(/título/i)
    expect(t).toMatch(/precio/i)
    expect(t).toMatch(/ubicación/i)
  })

  it('sin Errors usa el Detail del portal; sin JSON usa el código HTTP', () => {
    expect(explicarErrorArgenprop(400, JSON.stringify({ ErrorCode: 'PUB009', Detail: 'Aviso duplicado' })))
      .toMatch(/Aviso duplicado/)
    expect(explicarErrorArgenprop(500, '<html>Bad Gateway</html>')).toMatch(/de su lado/i)
    expect(explicarErrorArgenprop(400, '<html>x</html>')).not.toMatch(/</)
  })

  it('Errors como lista de strings también se entiende', () => {
    const cuerpo = JSON.stringify({ Errors: ['El campo Descripcion es obligatorio'] })
    expect(explicarErrorArgenprop(400, cuerpo)).toMatch(/Descripcion es obligatorio/)
  })
})

describe('recortarDetalle', () => {
  it('corta el detalle técnico para que nunca más entren 4 MB en last_error', () => {
    const r = recortarDetalle('x'.repeat(10_000))
    expect(r.length).toBeLessThanOrEqual(LARGO_MAXIMO_DETALLE + 40)
    expect(r).toMatch(/…/)
  })
  it('deja pasar un detalle corto tal cual', () => {
    expect(recortarDetalle('corto')).toBe('corto')
  })
})

describe('ocultarImagenesIncrustadas', () => {
  it('reemplaza cada data URL por una etiqueta corta', () => {
    const r = ocultarImagenesIncrustadas(`Valor inválido: ${BASE64} y otro ${BASE64}`)
    expect(r).toBe('Valor inválido: (imagen incrustada) y otro (imagen incrustada)')
  })
})
