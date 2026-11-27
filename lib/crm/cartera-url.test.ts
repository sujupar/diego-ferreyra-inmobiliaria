// crm-cartera-por-rol, tarea 3.9: filtros en la dirección, parámetros viejos de /crm y el
// "Volver" de la ficha (design.md D5 y D11).
import { describe, it, expect } from 'vitest'
import { FILTROS_DEFECTO, enlaceVolver, leerFiltrosCartera, traducirParametrosViejos } from './cartera-url'
import type { EtapaCRM } from './etapas'

const ASESOR_A = '11111111-1111-4111-8111-111111111111'
const ASESOR_B = '22222222-2222-4222-8222-222222222222'
const PERMITIDOS = {
  asesores: [ASESOR_A],
  etapas: ['solicitud', 'coordinada', 'no_realizada', 'descartado'] as EtapaCRM[],
}
const leer = (q: string, permitidos = PERMITIDOS) => leerFiltrosCartera(new URLSearchParams(q), permitidos)

describe('leerFiltrosCartera', () => {
  it('sin nada → los filtros por defecto, sin rechazos', () => {
    expect(leer('')).toEqual({ filtros: FILTROS_DEFECTO, rechazados: [] })
  })
  it('los filtros por defecto son todos texto', () => {
    for (const v of Object.values(FILTROS_DEFECTO)) expect(typeof v).toBe('string')
    expect(FILTROS_DEFECTO).toMatchObject({ seg: 'abiertos', orden: 'proximo' })
  })
  it('lee cada clave válida', () => {
    const { filtros, rechazados } = leer(
      `seg=cerrados&etapa=descartado&origen=referido&asesor=${ASESOR_A}&entro=rango&desde=2026-11-01&hasta=2026-11-25&q=pinto&trabado=sin-asesor&orden=nombre&colegas=1&ver=${ASESOR_B}`,
    )
    expect(rechazados).toEqual([])
    expect(filtros).toEqual({
      seg: 'cerrados', etapa: 'descartado', origen: 'referido', asesor: ASESOR_A, entro: 'rango',
      desde: '2026-11-01', hasta: '2026-11-25', q: 'pinto', trabado: 'sin-asesor', orden: 'nombre', colegas: '1', ver: ASESOR_B,
    })
  })
  it('asesor "sin"', () => {
    expect(leer('asesor=sin').filtros.asesor).toBe('sin')
  })
  it.each([
    ['etapa=inventada', 'Etapa', 'etapa'],
    ['etapa=seguimiento', 'Etapa', 'etapa'], // existe, pero no en esta vista
    ['origen=facebook', 'Origen', 'origen'],
    [`asesor=${ASESOR_B}`, 'Asesor', 'asesor'],
    ['asesor=no-es-uuid', 'Asesor', 'asesor'],
    ['entro=ayer2', 'Entró al CRM', 'entro'],
    ['trabado=todo', 'Lo que está trabado', 'trabado'],
    ['orden=precio', 'Ordenar por', 'orden'],
    ['seg=todos', 'Abiertos o cerrados', 'seg'],
    ['colegas=si', 'Colegas', 'colegas'],
    ['ver=no-es-uuid', 'Ver como', 'ver'],
  ])('%s → al defecto y rechazado como "%s"', (q, nombre, clave) => {
    const { filtros, rechazados } = leer(q)
    expect(rechazados).toEqual([nombre])
    expect(filtros[clave as keyof typeof filtros]).toBe(FILTROS_DEFECTO[clave as keyof typeof FILTROS_DEFECTO])
  })
  it('fechas mal escritas → sin rango y rechazado', () => {
    const { filtros, rechazados } = leer('entro=rango&desde=2026-13-40&hasta=ayer')
    expect(filtros).toMatchObject({ entro: '', desde: '', hasta: '' })
    expect(rechazados).toEqual(['Entró al CRM'])
  })
  it('una fecha que no existe en el calendario (30 de febrero) → rechazada', () => {
    const { filtros, rechazados } = leer('entro=rango&desde=2026-02-30')
    expect(filtros.entro).toBe('')
    expect(rechazados).toEqual(['Entró al CRM'])
  })
  it('un rango con una sola fecha válida se conserva', () => {
    expect(leer('entro=rango&desde=2026-11-01').filtros).toMatchObject({ entro: 'rango', desde: '2026-11-01', hasta: '' })
  })
  it('un rango al revés (desde después de hasta) → rechazado', () => {
    const { filtros, rechazados } = leer('entro=rango&desde=2026-11-25&hasta=2026-11-01')
    expect(filtros.entro).toBe('')
    expect(rechazados).toEqual(['Entró al CRM'])
  })
  it('desde/hasta sin entro=rango se ignoran', () => {
    expect(leer('desde=2026-11-01').filtros).toMatchObject({ entro: '', desde: '' })
  })
  it('un ver que no está entre las opciones (cuando se conocen) → rechazado', () => {
    const { filtros, rechazados } = leer(`ver=${ASESOR_B}`, { ...PERMITIDOS, verComo: [ASESOR_A] })
    expect(filtros.ver).toBe('')
    expect(rechazados).toEqual(['Ver como'])
  })
  it('la búsqueda se recorta y se limita a 100 caracteres', () => {
    expect(leer(`q=${'a'.repeat(150)}`).filtros.q).toHaveLength(100)
    expect(leer('q=%20%20pinto%20').filtros.q).toBe('pinto')
  })
  it('varias claves malas se avisan todas', () => {
    expect(leer('etapa=x&origen=y').rechazados).toEqual(['Etapa', 'Origen'])
  })
  it('un valor vacío no es un rechazo', () => {
    expect(leer('etapa=&origen=').rechazados).toEqual([])
  })
})

describe('traducirParametrosViejos', () => {
  const t = (q: string) => traducirParametrosViejos(new URLSearchParams(q))?.toString() ?? null
  it('origin → origen', () => {
    expect(t('origin=referido')).toBe('origen=referido')
  })
  it('from/to → entro=rango con desde/hasta', () => {
    expect(t('from=2026-11-01&to=2026-11-25')).toBe('desde=2026-11-01&hasta=2026-11-25&entro=rango')
  })
  it('solo from', () => {
    expect(t('from=2026-11-01')).toBe('desde=2026-11-01&entro=rango')
  })
  it('una etapa cerrada sin seg suma seg=cerrados', () => {
    expect(t('etapa=descartado')).toBe('etapa=descartado&seg=cerrados')
    expect(t('etapa=captada&origin=embudo')).toBe('etapa=captada&origen=embudo&seg=cerrados')
  })
  it('etapa abierta o asesor solos → null (se llaman igual en la dirección nueva)', () => {
    expect(t('etapa=seguimiento')).toBeNull()
    expect(t(`asesor=${ASESOR_A}`)).toBeNull()
    expect(t('etapa=seguimiento&asesor=sin')).toBeNull()
  })
  it('sin parámetros → null', () => {
    expect(t('')).toBeNull()
  })
  it('una etapa cerrada que ya trae seg → null', () => {
    expect(t('etapa=descartado&seg=cerrados')).toBeNull()
  })
  it('traducir dos veces → null la segunda (no hay bucle de redirección)', () => {
    for (const q of ['origin=referido', 'from=2026-11-01&to=2026-11-25', 'etapa=descartado', 'etapa=captada&origin=embudo&from=2026-01-01']) {
      const una = traducirParametrosViejos(new URLSearchParams(q))
      expect(una).not.toBeNull()
      expect(traducirParametrosViejos(new URLSearchParams(una?.toString() ?? ''))).toBeNull()
    }
  })
  it('conserva los demás parámetros', () => {
    expect(t('origin=referido&q=pinto&ver=x')).toBe('q=pinto&ver=x&origen=referido')
  })
  it('si ya hay "origen", el viejo no lo pisa', () => {
    expect(t('origin=referido&origen=embudo')).toBe('origen=embudo')
  })
})

describe('enlaceVolver', () => {
  it.each([
    ['/crm', 'Volver al CRM', 'crm'],
    ['/crm?etapa=seguimiento&q=pinto', 'Volver al CRM', 'crm'],
    ['/crm?q=pérez', 'Volver al CRM', 'crm'],
    ['/contacts', 'Volver a Contactos', 'contactos'],
    ['/contacts?seg=cerrados', 'Volver a Contactos', 'contactos'],
    ['/contacts/?seg=cerrados', 'Volver a Contactos', 'contactos'],
  ])('%s → válido', (v, texto, seccion) => {
    expect(enlaceVolver(v)).toEqual({ href: v, texto, seccion })
  })
  it.each([
    ['null', null],
    ['vacío', ''],
    ['otro sitio', 'https://otro.com'],
    ['protocolo relativo', '//otro.com'],
    ['barra invertida', '/\\otro.com'],
    ['arroba', '/crm@otro.com'],
    ['prefijo parecido', '/crmx'],
    ['otra ficha', '/contacts/123'],
    ['otra pantalla de la plataforma', '/pipeline/abc'],
    ['subruta de /crm', '/crm/algo'],
    ['javascript', 'javascript:alert(1)'],
    ['codificado', '%2F%2Fotro.com'],
    ['caracteres de control', '/crm\n//otro.com'],
    ['tabulación', '/crm\t'],
    ['caracter de control en la búsqueda', '/crm?q=a\u0000b'],
    ['salto de línea en la búsqueda', '/contacts?q=a\nb'],
    ['barra invertida en la búsqueda', '/crm?q=a\\b'],
    ['doble barra en el camino', '/crm//x'],
    ['camino con tilde en NFD', '/contactós'],
    ['demasiado largo', `/crm?q=${'a'.repeat(3000)}`],
  ])('%s → null', (_nombre, v) => {
    expect(enlaceVolver(v)).toBeNull()
  })
})
