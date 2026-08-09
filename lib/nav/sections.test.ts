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

  it('el asesor ve las mismas 10 rutas de siempre más Inicio (11)', () => {
    const hrefs = navHrefs(getNavSections('asesor'))
    expect(hrefs.sort()).toEqual([
      '/appraisal/new', '/appraisals', '/contacts', '/crm', '/inbox', '/inicio',
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

  it('el abogado no tiene Inicio: su entrada sigue siendo la revisión legal', () => {
    expect(navHrefs(getNavSections('abogado'))).not.toContain('/inicio')
  })

  it.each(['admin', 'dueno', 'coordinador', 'asesor'] as const)('%s entra por Inicio', role => {
    expect(navHrefs(getNavSections(role))[0]).toBe('/inicio')
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

  it('una subruta de un ítem de DESPLEGABLE no hereda el hermano específico — cae en el nombre del desplegable', () => {
    // Antes: { section: 'Propiedades', title: 'Listado' } — la ficha de UNA
    // propiedad (que no es el listado) se mostraba como si fuera el listado.
    // Listado/Nueva/Revisión legal son pantallas DISTINTAS entre sí, así que
    // afirmar "Listado" acá era mentir. Ahora se dice lo más específico que
    // sigue siendo honesto: estás en Propiedades, pero no en ninguna de sus
    // pantallas conocidas.
    expect(titleForPath(admin, '/properties/abc-123')).toEqual({ section: null, title: 'Propiedades' })
  })

  it('un ítem suelto SÍ hereda su propia etiqueta en una subruta — su etiqueta ya nombra toda el área', () => {
    // A diferencia de un desplegable, un ítem suelto (sin hermanos que sean
    // pantallas distintas) es el único punto de entrada a esa área: su
    // etiqueta describe el área completa, no una pantalla específica dentro
    // de ella, así que sigue siendo honesta en la ficha de un contacto.
    expect(titleForPath(admin, '/contacts/abc-123')).toEqual({ section: null, title: 'Contactos' })
  })

  it('un ítem suelto no tiene sección', () => {
    expect(titleForPath(admin, '/crm')).toEqual({ section: null, title: 'CRM' })
  })

  it('una ruta huérfana con título propio en EXTRA_TITLES no cae en el nombre de la casa', () => {
    // Antes: { section: null, title: 'Diego Ferreyra Inmobiliaria' } — /mi-perfil
    // no está en ningún menú, así que cualquier subruta desconocida caía en el
    // nombre de la empresa, un título sin relación con dónde está el usuario.
    // Ahora tiene título propio (única fuente: EXTRA_TITLES en sections.ts).
    expect(titleForPath(admin, '/mi-perfil')).toEqual({ section: null, title: 'Mi perfil' })
  })

  it('una ficha de deal (/pipeline/[id]) no está en el menú pero se declara honesta como CRM', () => {
    expect(titleForPath(admin, '/pipeline/xyz-789')).toEqual({ section: null, title: 'CRM' })
  })

  it('una ruta realmente desconocida (sin match de menú ni de EXTRA_TITLES) sigue cayendo en el nombre de la casa', () => {
    expect(titleForPath(admin, '/esto-no-existe')).toEqual({ section: null, title: 'Diego Ferreyra Inmobiliaria' })
  })

  it('/properties/review gana sobre /properties por ser el prefijo más largo (coincidencia exacta, no se degrada)', () => {
    expect(titleForPath(admin, '/properties/review')).toEqual({ section: 'Propiedades', title: 'Revisión legal' })
  })

  it('/appraisals/[id] (ficha de UNA tasación) cae en el nombre del desplegable, no en "Historial"', () => {
    expect(titleForPath(admin, '/appraisals/abc-123')).toEqual({ section: null, title: 'Tasaciones' })
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
