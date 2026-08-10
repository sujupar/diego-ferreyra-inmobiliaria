/**
 * Qué muestra y qué esconde CADA pantalla cuando su tabla se apila como ficha.
 *
 * `DataTable` sabe DIBUJAR una ficha, pero no puede saber qué le importa a un
 * asesor parado en la vereda: eso lo decide cada pantalla con el campo `card`
 * de sus columnas. Esa decisión es de negocio, no de layout, y hoy no la
 * protege nada: sumar una columna nueva sin declararle rol la manda a la ficha
 * como metadato, y borrar un `card: 'title'` deja la ficha SIN SUJETO (una
 * lista de datos sueltos sin forma de saber de qué fila hablan).
 *
 * Este archivo lee el código fuente de las pantallas. Es feo — pero las
 * columnas se declaran adentro de componentes de página con carga de datos,
 * identidad y filtros, que no se pueden renderizar sin montar media app. Entre
 * un test de texto y ninguna red, el de texto.
 *
 * (Visitas NO está acá: su tabla sí es un componente aislado, así que su
 * contrato se prueba renderizándolo de verdad en `VisitsTable.test.tsx`.)
 *
 * Al final hay dos bloques más, del mismo tipo y por el mismo motivo: el
 * renglón de datos de la vista de fichas PROPIA de Contactos —el único lugar
 * de la app que movía la página entera de costado— y el conmutador de vista de
 * las cuatro pantallas, que es el control que rescata al usuario de la vista
 * que no le sirve.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * El rol de ficha declarado para una columna, leído del código.
 *
 * Busca la columna DESDE el arranque del arreglo `columns` (así no confunde el
 * `key: 'origin'` de una columna con el de un desplegable de la barra de
 * filtros) y se queda con el trozo hasta la columna siguiente, que es el objeto
 * de esa columna aunque ocupe varios renglones.
 */
function rolDeclarado(fuente: string, clave: string): string | null {
    const arranque = fuente.indexOf('const columns: Column<')
    if (arranque === -1) throw new Error('esta pantalla no declara un arreglo `columns`')
    const region = fuente.slice(arranque)
    const inicio = region.indexOf(`key: '${clave}'`)
    if (inicio === -1) throw new Error(`no hay ninguna columna con la clave '${clave}'`)
    const siguiente = region.indexOf("key: '", inicio + 6)
    const objeto = region.slice(inicio, siguiente === -1 ? undefined : siguiente)
    return objeto.match(/card: '(\w+)'/)?.[1] ?? null
}

const fuente = (ruta: string) => readFileSync(resolve(__dirname, ruta), 'utf8')

/**
 * Pantalla → qué papel juega cada columna en la ficha del teléfono, y por qué.
 * Un cambio acá es un cambio de criterio de negocio: tiene que ser deliberado.
 */
const PANTALLAS: { nombre: string; ruta: string; roles: Record<string, string> }[] = [
    {
        nombre: 'Contactos',
        ruta: 'contacts/page.tsx',
        roles: {
            // Un contacto se reconoce por el nombre; al lado hace falta cómo llamarlo.
            full_name: 'title',
            phone: 'meta',
            email: 'meta',
            origin: 'badge',
            // La fecha de alta no cambia ninguna decisión en la calle.
            created_at: 'none',
        },
    },
    {
        nombre: 'Propiedades',
        ruta: 'properties/page.tsx',
        roles: {
            address: 'title',
            neighborhood: 'meta',
            asking_price: 'meta',
            status: 'badge',
            // Tipo, origen y fecha sirven para filtrar y ordenar, no para
            // reconocer una fila de un vistazo.
            property_type: 'none',
            origin: 'none',
            created_at: 'none',
        },
    },
    {
        nombre: 'Tasaciones',
        ruta: 'appraisals/page.tsx',
        roles: {
            property_title: 'title',
            property_location: 'meta',
            publication_price: 'meta',
            created_at: 'meta',
            // La cantidad de comparables es un dato del método, no del negocio.
            comparable_count: 'none',
            // Dos botones de 33px pegados: los dos destinos siguen disponibles
            // (la ficha abre el detalle, que tiene "Editar"; borrar sigue en la
            // selección múltiple).
            actions: 'none',
        },
    },
    {
        nombre: 'CRM',
        ruta: 'crm/page.tsx',
        roles: {
            contact_name: 'title',
            property_address: 'meta',
            crmStage: 'badge',
            stage_changed_at: 'meta',
            origin: 'none',
        },
    },
]

describe.each(PANTALLAS)('$nombre — qué entra en la ficha del teléfono', ({ ruta, roles }) => {
    const src = fuente(ruta)

    it.each(Object.entries(roles))("la columna '%s' juega de '%s'", (clave, rol) => {
        expect(rolDeclarado(src, clave)).toBe(rol)
    })

    it('tiene UN solo título: una ficha sin sujeto no se puede leer, y dos compiten', () => {
        const titulos = Object.values(roles).filter(r => r === 'title')
        expect(titulos).toHaveLength(1)
        // Y en el código tampoco puede haber uno de más que la tabla de acá
        // arriba no conozca.
        const arranque = src.indexOf('const columns: Column<')
        const declarados = src.slice(arranque).split("card: 'title'").length - 1
        expect(declarados).toBe(1)
    })

    it('deja al menos un dato en el segundo renglón (si no, la ficha es un título pelado)', () => {
        expect(Object.values(roles).filter(r => r === 'meta').length).toBeGreaterThan(0)
    })
})

/**
 * El único lugar de la app que movía la PÁGINA ENTERA de costado, y no era una
 * tabla: la vista de fichas propia de Contactos.
 *
 * El renglón de teléfono/email/fecha era un `flex` sin `min-w-0` ni
 * `flex-wrap`, y un email tipo maria.fernanda.gonzalez@estudiojuridico.com.ar
 * es UN token indivisible (~250px de mínimo). Los hijos de un flex no se
 * encogen por debajo de su contenido: el sobrante empujaba la fila, salía de la
 * tarjeta y llegaba al viewport. La red de `overflow-wrap` de `globals.css`
 * tapa el síntoma; esto arregla la causa.
 */
describe('Contactos — el renglón de datos de la ficha propia', () => {
    const src = fuente('contacts/page.tsx')
    const renglon = src.match(/<div className="row-meta[^"]*">[\s\S]*?<\/div>/)

    it('usa `row-meta`: envuelve y puede encogerse', () => {
        expect(renglon, 'el renglón de metadatos ya no usa `row-meta`').toBeTruthy()
    })

    it('el email y el teléfono se cortan en vez de empujar', () => {
        expect(renglon![0]).toContain('{c.email}')
        // Cada dato largo va en su propio `span` con `truncate`, adentro de un
        // contenedor `min-w-0`: sin las dos cosas juntas, `truncate` no corta
        // nada (un flex item no baja de su ancho mínimo por sí solo).
        expect(renglon![0]).toMatch(/min-w-0[^>]*>[\s\S]*?truncate[\s\S]*?\{c\.email\}/)
        expect(renglon![0]).toMatch(/min-w-0[^>]*>[\s\S]*?truncate[\s\S]*?\{c\.phone\}/)
    })
})

/**
 * El control que rescata al usuario de la vista que no le sirve era el blanco
 * más chico y el único sin nombre de toda la pantalla.
 */
describe.each([
    ['Contactos', 'contacts/page.tsx'],
    ['Tasaciones', 'appraisals/page.tsx'],
    ['Propiedades', 'properties/page.tsx'],
    ['CRM', 'crm/page.tsx'],
])('%s — el conmutador de vista', (_nombre, ruta) => {
    it('cada botón dice qué hace y cuál está puesta', () => {
        const src = fuente(ruta)
        expect(src).toContain("aria-label=\"Ver como fichas\"")
        expect(src).toContain("aria-label=\"Ver como tabla\"")
        expect(src).toMatch(/aria-pressed=\{viewMode === '(list|cards)'\}/)
        expect(src).toMatch(/aria-pressed=\{viewMode === 'table'\}/)
    })
})

describe('la barra de filtros no se confunde con una columna', () => {
    it("el `key: 'origin'` del desplegable de Contactos no se lee como el de la columna", () => {
        // Guarda del helper de arriba: si algún día las columnas se mueven
        // DEBAJO de la barra de filtros, esta lectura empezaría a mirar el
        // objeto equivocado y todos los tests de esta pantalla mentirían.
        const src = fuente('contacts/page.tsx')
        expect(src.indexOf('const columns: Column<')).toBeLessThan(src.indexOf('<FilterBar'))
    })
})
