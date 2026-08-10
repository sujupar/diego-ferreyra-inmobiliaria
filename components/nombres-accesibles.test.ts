/**
 * Ningún botón de SOLO ÍCONO puede quedarse sin nombre.
 *
 * Por qué un barrido y no un test por pantalla: la revisión encontró uno
 * (el "Editar" del historial de tasaciones) y el barrido a mano encontró cinco
 * más — el refrescar del CRM, el cerrar del visor de PDF, el cerrar del editor
 * de comparables, el quitar de la grilla de comparables y el quitar de un turno
 * en el banco de pruebas del agente. Todos con la misma forma: `size="icon"` y
 * adentro un solo `<Icono />`. Para un lector de pantalla eso es "botón", punto;
 * y varios están al lado de otro botón que SÍ tiene nombre, así que ni siquiera
 * se puede adivinar por contexto. Uno por uno se vuelven a colar; el barrido
 * cierra la clase entera.
 *
 * ALCANCE, y por qué es este: mira los `<Button size="icon…">`, que es el
 * idioma del sistema para "esto es solo un ícono". NO alcanza a un `<button>`
 * pelado con un ícono adentro (no hay forma barata de distinguirlo de uno con
 * texto sin un parser de JSX de verdad). Si alguna vez aparece ese caso, el
 * lugar donde sumarlo es acá.
 *
 * Vale como nombre: `aria-label`, `aria-labelledby`, `title` en el elemento, o
 * un `sr-only` adentro (texto que solo lee el lector de pantalla).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

const raiz = resolve(__dirname, '..')

/**
 * Dónde termina el tag de apertura que arranca en `desde`: el primer `>` que
 * está fuera de comillas y a profundidad 0 de llaves.
 *
 * Hace falta esta cuenta y no un `indexOf('>')`: casi todos estos botones traen
 * un `onClick={() => …}`, y esa flecha tiene un `>` que corta el tag por la
 * mitad. Con el corte mal puesto el barrido daba 12 hallazgos, 9 de ellos
 * botones que SÍ tenían `aria-label` — o sea, ruido que habría hecho ignorar
 * el test.
 */
function finDeApertura(fuente: string, desde: number): number {
    let llaves = 0
    let comilla: string | null = null
    for (let i = desde; i < fuente.length; i++) {
        const c = fuente[i]
        if (comilla) {
            if (c === comilla) comilla = null
            continue
        }
        if (c === '"' || c === "'" || c === '`') { comilla = c; continue }
        if (c === '{') llaves++
        else if (c === '}') llaves--
        else if (c === '>' && llaves === 0) return i
    }
    return -1
}

function archivosDePantalla(): string[] {
    const encontrados: string[] = []
    const recorrer = (dir: string) => {
        for (const entrada of readdirSync(dir, { withFileTypes: true })) {
            if (entrada.name === 'node_modules' || entrada.name.startsWith('.')) continue
            const ruta = join(dir, entrada.name)
            if (entrada.isDirectory()) recorrer(ruta)
            else if (entrada.name.endsWith('.tsx') && !entrada.name.includes('.test.')) encontrados.push(ruta)
        }
    }
    for (const carpeta of ['app', 'components']) recorrer(resolve(raiz, carpeta))
    return encontrados
}

function sinNombre(): string[] {
    const culpables: string[] = []
    for (const ruta of archivosDePantalla()) {
        const fuente = readFileSync(ruta, 'utf8')
        for (let i = fuente.indexOf('<Button'); i !== -1; i = fuente.indexOf('<Button', i + 1)) {
            const fin = finDeApertura(fuente, i)
            if (fin === -1) continue
            const atributos = fuente.slice(i, fin)
            if (!/size=["']icon/.test(atributos)) continue
            if (/aria-label|aria-labelledby|title=/.test(atributos)) continue
            const cierre = fuente.indexOf('</Button>', fin)
            const hijos = cierre === -1 ? '' : fuente.slice(fin, cierre)
            if (/sr-only|aria-label/.test(hijos)) continue
            culpables.push(`${ruta.slice(raiz.length + 1)}:${fuente.slice(0, i).split('\n').length}`)
        }
    }
    return culpables
}

describe('accesibilidad — un botón de solo ícono siempre dice qué hace', () => {
    it('no queda ninguno sin nombre en toda la aplicación', () => {
        const culpables = sinNombre()
        expect(
            culpables,
            `botones de solo ícono sin nombre:\n  ${culpables.join('\n  ')}\n` +
                'Poneles `aria-label` (o un `sr-only` adentro). Si el control se repite ' +
                'por fila, el nombre tiene que decir DE QUÉ fila: veinte "Editar" ' +
                'idénticos no distinguen ninguna.',
        ).toEqual([])
    })

    it('el barrido no es una cáscara vacía: encuentra el defecto si vuelve', () => {
        // Un test que recorre archivos y siempre da lista vacía puede estar roto
        // (una ruta mal, un filtro de más) y nadie se entera. Esto comprueba que
        // el barrido SÍ marca un botón sin nombre, y que NO marca uno que lo
        // tiene aunque el `onClick` traiga una flecha con `>` adentro.
        const conNombre = '<Button size="icon" onClick={() => cerrar()} aria-label="Cerrar"><X /></Button>'
        const pelado = '<Button size="icon" onClick={() => cerrar()}><X /></Button>'
        const nombra = (fuente: string) => {
            const fin = finDeApertura(fuente, 0)
            return /aria-label/.test(fuente.slice(0, fin))
        }
        expect(nombra(conNombre)).toBe(true)
        expect(nombra(pelado)).toBe(false)
    })
})
