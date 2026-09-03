import { describe, it, expect } from 'vitest'
import {
  MAX_CARACTERES_CONSULTA,
  MAX_LARGO_BUSQUEDA,
  normalizarBusqueda,
  palabrasDeBusqueda,
  patronRegex,
  valorPostgrest,
  clausulasBusqueda,
} from './busqueda-texto'

/**
 * Ayuda de las pruebas: corre el patrón como una expresión regular de verdad.
 * Postgres usa ARE y JavaScript usa su propio motor, pero para lo único que
 * genera este módulo —literales escapados y clases de caracteres— los dos se
 * comportan igual. Probar el COMPORTAMIENTO ("encuentra Díaz escribiendo diaz")
 * vale mucho más que comparar la cadena del patrón contra otra cadena escrita
 * a mano, que solo probaría que sé copiar y pegar.
 */
function encuentra(palabra: string, texto: string): boolean {
  return new RegExp(patronRegex(palabra), 'i').test(texto)
}

describe('normalizarBusqueda', () => {
  it('recorta los espacios de las puntas', () => {
    expect(normalizarBusqueda('  almagro  ')).toBe('almagro')
  })

  it('colapsa los espacios de adentro en uno solo', () => {
    expect(normalizarBusqueda('diaz    velez')).toBe('diaz velez')
  })

  it('trata los tabs y saltos de linea como espacios', () => {
    expect(normalizarBusqueda('diaz\t\nvelez')).toBe('diaz velez')
  })

  it('devuelve vacio cuando solo hay espacios', () => {
    expect(normalizarBusqueda('     ')).toBe('')
  })

  it('corta el termino larguisimo al tope', () => {
    const largo = 'a'.repeat(MAX_LARGO_BUSQUEDA + 50)
    expect(normalizarBusqueda(largo)).toHaveLength(MAX_LARGO_BUSQUEDA)
  })

  it('es idempotente cuando el corte cae justo en un espacio', () => {
    // El contrato de `use-filtros-url` exige n(n(x)) === n(x). Sin el segundo
    // trim, este caso deja un espacio al final en la primera pasada y lo saca
    // en la segunda: el espejo del control nunca converge y el filtro se traba.
    const justo = 'a'.repeat(MAX_LARGO_BUSQUEDA - 1) + ' bb'
    const unaVez = normalizarBusqueda(justo)
    expect(normalizarBusqueda(unaVez)).toBe(unaVez)
  })

  it('junta las tildes sueltas del texto pegado (Unicode descompuesto)', () => {
    // macOS entrega el texto DESCOMPUESTO: la «ó» son dos caracteres (o + tilde
    // suelta). Copiar «Autónoma» del Finder y pegarlo devolvia CERO fichas, sin
    // error. Verificado: el propio nombre de esta carpeta esta descompuesto.
    const descompuesto = 'Auto\u0301noma'
    expect(descompuesto).toHaveLength(9)
    expect(normalizarBusqueda(descompuesto)).toBe('Autónoma')
    expect(normalizarBusqueda(descompuesto)).toHaveLength(8)
  })

  it('sigue siendo idempotente despues de juntar las tildes', () => {
    const unaVez = normalizarBusqueda('Auto\u0301noma')
    expect(normalizarBusqueda(unaVez)).toBe(unaVez)
  })
})

describe('palabrasDeBusqueda', () => {
  it('parte el termino en palabras', () => {
    expect(palabrasDeBusqueda('almagro 3841')).toEqual(['almagro', '3841'])
  })

  it('devuelve lista vacia con termino vacio', () => {
    expect(palabrasDeBusqueda('')).toEqual([])
  })

  it('no devuelve palabras vacias con espacios de sobra', () => {
    expect(palabrasDeBusqueda('  almagro   3841 ')).toEqual(['almagro', '3841'])
  })
})

describe('patronRegex — tildes', () => {
  it('encuentra el dato CON tilde escribiendo SIN tilde', () => {
    // Caso real: la ubicacion guardada dice "Ciudad Autónoma de Buenos Aires".
    expect(encuentra('autonoma', 'Ciudad Autónoma de Buenos Aires')).toBe(true)
  })

  it('encuentra el dato SIN tilde escribiendo CON tilde', () => {
    // Caso real invertido: el titulo guardado dice "Diaz Velez 3841", sin tildes.
    expect(encuentra('díaz', 'Diaz Velez 3841')).toBe(true)
  })

  it('encuentra la enie en las dos direcciones', () => {
    expect(encuentra('acuna', 'F.ACUÑA DE FIGUEROA 307')).toBe(true)
    expect(encuentra('acuña', 'F.ACUNA DE FIGUEROA 307')).toBe(true)
  })

  it('ignora mayusculas y minusculas', () => {
    // Caso real: los titulos vienen en mayusculas ("BILLINGHURST 1850 PB").
    expect(encuentra('billinghurst', 'BILLINGHURST 1850 PB')).toBe(true)
  })

  it('no encuentra una palabra que no esta', () => {
    expect(encuentra('palermo', 'Diaz Velez 3841, Almagro')).toBe(false)
  })
})

describe('patronRegex — caracteres especiales', () => {
  it('trata el asterisco como un asterisco, no como comodin', () => {
    // Verificado contra la base: sin escapar, "2*D" devolvia 17 fichas.
    expect(encuentra('2*D', 'SALTA 297 2*D')).toBe(true)
    expect(encuentra('2*D', 'SALTA 297 22D')).toBe(false)
  })

  it('trata el punto como un punto, no como "cualquier caracter"', () => {
    expect(encuentra('Tte.', 'Tte. Gral. Juan D. Perón')).toBe(true)
    expect(encuentra('Tte.', 'TteX Gral')).toBe(false)
  })

  it('no rompe con un parentesis suelto', () => {
    // Sin escapar, esto hacia que la base devolviera error 400.
    expect(() => patronRegex('(')).not.toThrow()
    expect(encuentra('(', 'Depto (frente)')).toBe(true)
  })

  it('no rompe con un corchete suelto', () => {
    expect(encuentra('[', 'Lote [A]')).toBe(true)
  })

  it('escapa un patron que podria colgar el motor de regex', () => {
    // Si esto llegara crudo, seria una expresion con retroceso catastrofico.
    const patron = patronRegex('(a+)+$')
    expect(new RegExp(patron, 'i').test('(a+)+$')).toBe(true)
    expect(new RegExp(patron, 'i').test('aaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(false)
  })

  it('trata la barra invertida como texto', () => {
    expect(encuentra('a\\b', 'ruta a\\b')).toBe(true)
  })

  it('devuelve vacio para palabra vacia', () => {
    expect(patronRegex('')).toBe('')
  })
})

describe('valorPostgrest', () => {
  it('envuelve el patron entre comillas dobles', () => {
    expect(valorPostgrest('almagro')).toBe('"almagro"')
  })

  it('DUPLICA la barra invertida', () => {
    // Verificado contra la API: dentro de comillas, PostgREST se come UNA barra.
    // Con una sola, "2\*D" llegaba a Postgres como 2*D y devolvia 17 fichas;
    // con la barra duplicada llega como 2\*D y devuelve 1.
    expect(valorPostgrest('2\\*D')).toBe('"2\\\\*D"')
  })

  it('escapa la comilla doble', () => {
    // Hay un titulo real con comillas: Tte. Gral. Juan D. Perón 4227-13 "B".
    expect(valorPostgrest('13 "B"')).toBe('"13 \\"B\\""')
  })

  it('deja intacta la clase de caracteres de las tildes', () => {
    expect(valorPostgrest('Per[oó]n')).toBe('"Per[oó]n"')
  })

  it('deja la coma adentro de las comillas', () => {
    // Una coma suelta rompe el arbol logico de PostgREST (error PGRST100).
    expect(valorPostgrest('a,b')).toBe('"a,b"')
  })
})

describe('clausulasBusqueda', () => {
  const COLUMNAS = ['property_title', 'property_location']

  it('arma una clausula por palabra — las clausulas se combinan con Y', () => {
    // Verificado contra la API: dos or() encadenados se combinan con AND.
    // "almagro palermo" da 0 fichas; "almagro 3841" da 1.
    expect(clausulasBusqueda(COLUMNAS, 'almagro 3841')).toHaveLength(2)
  })

  it('cada clausula pregunta por TODAS las columnas', () => {
    const [clausula] = clausulasBusqueda(COLUMNAS, 'almagro')
    expect(clausula).toBe(
      'property_title.imatch."[aáàâäã]lm[aáàâäã]gr[oóòôöõ]",' +
      'property_location.imatch."[aáàâäã]lm[aáàâäã]gr[oóòôöõ]"'
    )
  })

  it('devuelve lista vacia con termino vacio', () => {
    expect(clausulasBusqueda(COLUMNAS, '   ')).toEqual([])
  })

  it('devuelve lista vacia sin columnas', () => {
    expect(clausulasBusqueda([], 'almagro')).toEqual([])
  })

  it('la coma que escribe el usuario no parte la clausula en dos', () => {
    const [clausula] = clausulasBusqueda(['address'], 'a,b')
    expect(clausula).toBe('address.imatch."[aáàâäã],b"')
  })

  it('normaliza el termino antes de partirlo', () => {
    expect(clausulasBusqueda(COLUMNAS, '  diaz    velez  ')).toHaveLength(2)
  })

  it('encuentra el dato acentuado aunque el texto pegado venga descompuesto', () => {
    const [conTilde] = clausulasBusqueda(['property_location'], 'Auto\u0301noma')
    const [sinTilde] = clausulasBusqueda(['property_location'], 'autonoma')
    // Las dos formas tienen que producir la MISMA consulta.
    expect(conTilde.toLowerCase()).toBe(sinTilde.toLowerCase())
  })
})

/**
 * El tope de 80 caracteres acota el TEXTO, no la consulta que ese texto genera,
 * y la relación entre las dos cosas varía diez veces según qué se escriba: cada
 * vocal se vuelve una clase de seis caracteres que al codificarse en la
 * dirección pesa ~35, y cada palabra repite la condición para TODAS las
 * columnas. Medido contra la base real: 33 palabras de una letra —65 caracteres,
 * dentro del tope— arman una dirección de 10,9 KB y el pedido revienta con
 * `UND_ERR_HEADERS_OVERFLOW`; el listado responde 500.
 */
describe('clausulasBusqueda — tope de tamaño de la consulta', () => {
  const CINCO = ['address', 'neighborhood', 'city', 'property_type', 'operation_type']
  const pesoDe = (cs: string[]) => cs.reduce((n, c) => n + encodeURIComponent(c).length, 0)

  it('una busqueda normal no se recorta', () => {
    expect(clausulasBusqueda(CINCO, 'diaz velez almagro')).toHaveLength(3)
  })

  it('muchas palabras cortas no pasan del tope', () => {
    const muchas = Array.from({ length: 40 }, () => 'a').join(' ')
    expect(pesoDe(clausulasBusqueda(CINCO, muchas))).toBeLessThanOrEqual(MAX_CARACTERES_CONSULTA)
  })

  it('una sola palabra larguisima con tildes tampoco pasa del tope', () => {
    expect(pesoDe(clausulasBusqueda(CINCO, 'á'.repeat(MAX_LARGO_BUSQUEDA)))).toBeLessThanOrEqual(MAX_CARACTERES_CONSULTA)
  })

  it('el peor caso posible sigue dentro del tope', () => {
    // Todo el termino en letras que se expanden a clase, en palabras de una letra.
    const peor = Array.from({ length: MAX_LARGO_BUSQUEDA }, () => 'á').join(' ')
    expect(pesoDe(clausulasBusqueda(CINCO, peor))).toBeLessThanOrEqual(MAX_CARACTERES_CONSULTA)
  })

  it('SIEMPRE deja al menos una condicion si habia texto', () => {
    // Si el recorte dejara la lista vacia, buscar algo mostraria TODO — una
    // mentira peor que un error.
    expect(clausulasBusqueda(CINCO, 'á'.repeat(MAX_LARGO_BUSQUEDA)).length).toBeGreaterThanOrEqual(1)
  })
})
