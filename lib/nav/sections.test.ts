import { describe, it, expect } from 'vitest'
import { getNavSections, navHrefs, titleForPath, isCollapsible, activeHrefAmong } from './sections'

describe('getNavSections — permisos del menú', () => {
  it('el abogado ve exactamente sus 3 pantallas y ninguna más', () => {
    const hrefs = navHrefs(getNavSections('abogado'))
    expect(hrefs).toEqual(['/tasks', '/properties/review', '/appraisals'])
  })

  it('el abogado no lleva títulos de grupo (con 3 ítems, agrupar es ruido)', () => {
    const groups = getNavSections('abogado')
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBeNull()
  })

  it('el asesor ve las mismas 10 rutas que hoy', () => {
    const hrefs = navHrefs(getNavSections('asesor'))
    expect(hrefs.sort()).toEqual([
      '/appraisal/new', '/appraisals', '/contacts', '/crm', '/inbox',
      '/pipeline/new', '/properties', '/redes-sociales', '/tasks', '/visits',
    ])
  })

  it('el asesor no ve administración, métricas ni avisos', () => {
    const hrefs = navHrefs(getNavSections('asesor'))
    expect(hrefs).not.toContain('/settings')
    expect(hrefs).not.toContain('/users')
    expect(hrefs).not.toContain('/metrics')
    expect(hrefs).not.toContain('/avisos')
    expect(hrefs).not.toContain('/properties/review')
  })

  it('el coordinador ve avisos pero NO "Nueva tasación" ni administración', () => {
    const hrefs = navHrefs(getNavSections('coordinador'))
    expect(hrefs).toContain('/avisos')
    expect(hrefs).toContain('/properties/new')
    expect(hrefs).not.toContain('/appraisal/new')
    expect(hrefs).not.toContain('/settings')
    expect(hrefs).not.toContain('/users')
  })

  it('el admin ve todo, incluida la revisión legal y las herramientas', () => {
    const hrefs = navHrefs(getNavSections('admin'))
    for (const h of [
      '/properties/review', '/metrics', '/embudos', '/users',
      '/settings', '/settings/notifications', '/settings/portals',
      '/admin/pipeline-test', '/admin/email-test', '/admin/ai-agent', '/admin/ai-usage',
    ]) expect(hrefs).toContain(h)
  })

  it('el dueño NO ve revisión legal (no tiene properties.review) pero sí métricas y usuarios', () => {
    const hrefs = navHrefs(getNavSections('dueno'))
    expect(hrefs).not.toContain('/properties/review')
    expect(hrefs).toContain('/metrics')
    expect(hrefs).toContain('/users')
  })

  it('el dueño sigue viendo "Nueva tasación" aunque no tenga appraisal.create (así está hoy)', () => {
    expect(navHrefs(getNavSections('dueno'))).toContain('/appraisal/new')
  })

  // Los roles heredados caen en el `default:` del switch de hoy. Si se quedaran
  // sin menú, un usuario legacy no podría navegar la plataforma.
  it.each(['agent', 'viewer'] as const)('el rol heredado %s conserva el menú base sin nada de administración', role => {
    const hrefs = navHrefs(getNavSections(role))
    expect(hrefs).toContain('/tasks')
    expect(hrefs).toContain('/inbox')
    expect(hrefs).toContain('/properties')
    expect(hrefs).not.toContain('/settings')
    expect(hrefs).not.toContain('/users')
    expect(hrefs).not.toContain('/metrics')
    expect(hrefs).not.toContain('/properties/review')
  })

  it.each(['admin', 'dueno', 'coordinador', 'asesor', 'abogado', 'agent', 'viewer'] as const)(
    'el menú de %s no repite ninguna ruta',
    role => {
      const hrefs = navHrefs(getNavSections(role))
      expect(new Set(hrefs).size).toBe(hrefs.length)
    },
  )

  it('solo el Inbox lleva contador', () => {
    for (const role of ['admin', 'coordinador', 'asesor'] as const) {
      const conBadge: string[] = []
      for (const g of getNavSections(role)) {
        for (const e of g.entries) {
          if (isCollapsible(e)) {
            for (const i of e.items) if (i.badge) conBadge.push(i.href)
          } else if (e.badge) conBadge.push(e.href)
        }
      }
      expect(conBadge).toEqual(['/inbox'])
    }
  })

  it('toda entrada desplegable tiene al menos un hijo visible', () => {
    for (const role of ['admin', 'dueno', 'coordinador', 'asesor', 'abogado'] as const) {
      for (const g of getNavSections(role)) {
        for (const e of g.entries) {
          if (isCollapsible(e)) expect(e.items.length).toBeGreaterThan(0)
        }
      }
    }
  })
})

describe('titleForPath', () => {
  const admin = getNavSections('admin')

  it('acierta la ruta exacta', () => {
    expect(titleForPath(admin, '/properties/new')).toEqual({ section: 'Propiedades', title: 'Nueva' })
  })

  it('una subruta cae en el prefijo más largo', () => {
    expect(titleForPath(admin, '/properties/abc-123')).toEqual({ section: 'Propiedades', title: 'Listado' })
  })

  it('un ítem suelto no tiene sección', () => {
    expect(titleForPath(admin, '/crm')).toEqual({ section: null, title: 'CRM' })
  })

  it('una ruta desconocida cae en el nombre de la casa', () => {
    expect(titleForPath(admin, '/mi-perfil')).toEqual({ section: null, title: 'Diego Ferreyra Inmobiliaria' })
  })

  it('/properties/review gana sobre /properties por ser el prefijo más largo', () => {
    expect(titleForPath(admin, '/properties/review')).toEqual({ section: 'Propiedades', title: 'Revisión legal' })
  })
})

describe('activeHrefAmong', () => {
  const hermanos = ['/properties', '/properties/new', '/properties/review']

  it('la ruta exacta gana aunque también sea prefijo de otro hermano', () => {
    // Antes del fix, /properties (prefijo) y /properties/new (exacto)
    // "matcheaban" los dos por separado — acá tiene que ganar uno solo.
    expect(activeHrefAmong(hermanos, '/properties/new')).toBe('/properties/new')
  })

  it('entre dos prefijos, gana el más largo', () => {
    // No hay coincidencia exacta acá (ninguno de los hermanos es
    // '/properties/new/foto-1'), así que compiten como prefijos.
    expect(activeHrefAmong(hermanos, '/properties/new/foto-1')).toBe('/properties/new')
  })

  it('una subruta de la raíz cae en la raíz cuando es el único que matchea', () => {
    expect(activeHrefAmong(hermanos, '/properties/abc-123')).toBe('/properties')
  })

  it('devuelve null si ningún hermano matchea', () => {
    expect(activeHrefAmong(hermanos, '/crm')).toBeNull()
  })

  it('devuelve null con la lista vacía', () => {
    expect(activeHrefAmong([], '/properties')).toBeNull()
  })
})
