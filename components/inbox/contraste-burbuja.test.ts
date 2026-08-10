/**
 * Contraste del texto chico DENTRO de las burbujas del chat.
 *
 * Por qué existe este archivo: hasta la Fase 1 la hora y el estado ("Enviado",
 * "Leído") iban DEBAJO de la burbuja, sobre el crema del hilo. El rediseño los
 * metió ADENTRO —vale un renglón por mensaje, que en un teléfono es mucho— pero
 * cambió el fondo bajo sus pies: el verde de la burbuja saliente es más oscuro
 * que el crema. El gris del sistema pasó a dar 4.27:1 y el azul de "Leído"
 * 3.31:1, contra los 4.5:1 que pide WCAG AA para texto chico. Nadie lo iba a
 * notar mirando (son 11px de gris sobre verde claro: se ve "bien"), y no hay
 * navegador acá para medirlo.
 *
 * Así que se mide. La cuenta es la de la norma —oklch → sRGB → luminancia
 * relativa → (L1+0.05)/(L2+0.05)— y los colores se LEEN de `app/globals.css`,
 * no se copian: si alguien vuelve a poner `var(--muted-foreground)` en
 * `--chat-meta`, o retoca la paleta del chat el día que el dueño resuelva la
 * contradicción de "sin copiar WhatsApp", este test se pone rojo con el número
 * exacto que falta.
 *
 * Lo que NO mide: el verde y el crema en sí. Esos son decisión del dueño y no
 * son texto — `globals.movil.test.ts` ya fija que no se muevan.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../../app/globals.css'), 'utf8')

type Rgb = [number, number, number]

/** oklch(L C H [/ A]) → sRGB 0..1 + alfa. Acepta la L en 0..1 o en `%`. */
function oklch(valor: string): { rgb: Rgb; alfa: number } {
    const m = valor.match(
        /oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)\s*)?\)/,
    )
    if (!m) throw new Error(`no es un oklch: ${valor}`)
    const L = m[2] === '%' ? Number(m[1]) / 100 : Number(m[1])
    const C = Number(m[3])
    const h = (Number(m[4]) * Math.PI) / 180
    const alfa = m[5] === undefined ? 1 : Number(m[5])

    const a = C * Math.cos(h)
    const b = C * Math.sin(h)
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
    const lineal = [
        4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
    ]
    const codificar = (v: number) => {
        const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055
        return Math.min(1, Math.max(0, c))
    }
    return { rgb: lineal.map(codificar) as Rgb, alfa }
}

/** Luminancia relativa de WCAG 2.x. */
function luminancia([r, g, b]: Rgb): number {
    const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contraste(uno: Rgb, otro: Rgb): number {
    const a = luminancia(uno)
    const b = luminancia(otro)
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** Composita un color con alfa sobre un fondo opaco. */
function sobre(frente: Rgb, alfa: number, fondo: Rgb): Rgb {
    return frente.map((c, i) => c * alfa + fondo[i] * (1 - alfa)) as Rgb
}

/**
 * El bloque de declaraciones que arranca en el `:root {` (o `.dark {`) que
 * CONTIENE los tokens del chat. La hoja tiene varios `:root`: el de la paleta
 * general y el del chat. Se ancla al token, no a la posición.
 */
function bloqueDelChat(selector: ':root' | '.dark'): string {
    const marca = `${selector} {`
    for (let i = css.indexOf(marca); i !== -1; i = css.indexOf(marca, i + 1)) {
        const bloque = css.slice(i, css.indexOf('\n}', i))
        if (bloque.includes('--chat-surface:')) return bloque
    }
    throw new Error(`no se encontró el bloque ${selector} del chat`)
}

/** Lee un token del bloque del chat y lo devuelve como color. */
function token(tema: ':root' | '.dark', nombre: string): { rgb: Rgb; alfa: number } {
    const bloque = bloqueDelChat(tema)
    const m = bloque.match(new RegExp(`${nombre}:\\s*([^;]+);`))
    expect(m, `falta ${nombre} en ${tema}`).toBeTruthy()
    return oklch(m![1].trim())
}

/** Los dos fondos sobre los que se dibuja la hora, ya compuestos. */
function burbujas(tema: ':root' | '.dark'): { saliente: Rgb; entrante: Rgb } {
    const hilo = token(tema, '--chat-surface').rgb
    const out = token(tema, '--chat-out-bg')
    const dentro = token(tema, '--chat-in-bg')
    return {
        // La saliente en oscuro es `emerald-900/50`: translúcida sobre el hilo.
        saliente: sobre(out.rgb, out.alfa, hilo),
        entrante: sobre(dentro.rgb, dentro.alfa, hilo),
    }
}

const AA_TEXTO_CHICO = 4.5

describe('burbujas del chat — la hora y el estado pasan AA (4.5:1)', () => {
    for (const tema of [':root', '.dark'] as const) {
        const nombre = tema === ':root' ? 'claro' : 'oscuro'

        it(`la hora (\`--chat-meta\`) se lee sobre las dos burbujas — tema ${nombre}`, () => {
            const { saliente, entrante } = burbujas(tema)
            const meta = token(tema, '--chat-meta').rgb
            // La saliente es la que manda: el verde es el fondo más oscuro de
            // los dos en claro, y el más CLARO de los dos en oscuro (el verde
            // tiene más luz que el gris del zinc-800). O sea que se rompe
            // primero acá, en los dos temas.
            expect(contraste(meta, saliente)).toBeGreaterThanOrEqual(AA_TEXTO_CHICO)
            expect(contraste(meta, entrante)).toBeGreaterThanOrEqual(AA_TEXTO_CHICO)
        })

        it(`el azul de "Leído" (\`--chat-read\`) se lee sobre las dos burbujas — tema ${nombre}`, () => {
            const { saliente, entrante } = burbujas(tema)
            const leido = token(tema, '--chat-read').rgb
            expect(contraste(leido, saliente)).toBeGreaterThanOrEqual(AA_TEXTO_CHICO)
            expect(contraste(leido, entrante)).toBeGreaterThanOrEqual(AA_TEXTO_CHICO)
        })
    }

    it('la cuenta es la de la norma (control con blanco y negro puros)', () => {
        // Si la conversión de color se rompiera, todo lo de arriba pasaría por
        // casualidad y nadie se enteraría. Blanco sobre negro son 21:1 exactos.
        expect(contraste(oklch('oklch(1 0 0)').rgb, oklch('oklch(0 0 0)').rgb)).toBeCloseTo(21, 1)
    })
})

describe('burbujas del chat — el componente consume los tokens', () => {
    const burbuja = readFileSync(resolve(__dirname, 'MessageBubble.tsx'), 'utf8')

    it('la hora sale de `--chat-meta` y no de un gris suelto', () => {
        expect(burbuja).toContain('text-[color:var(--chat-meta)]')
    })

    it('ningún estado dentro de la burbuja usa `text-muted-foreground` ni `text-blue-500`', () => {
        // Los dos son los colores medidos que NO pasan sobre el verde: el gris
        // del sistema da 4.27:1 y `blue-500` 3.31:1. Los estados neutros van sin
        // color propio (heredan `--chat-meta`) y "Leído" usa `--chat-read`.
        const estados = burbuja.slice(
            burbuja.indexOf('function outboundStatusMeta'),
            burbuja.indexOf('function MediaContent'),
        )
        expect(estados).not.toContain('text-muted-foreground')
        expect(estados).not.toContain('text-blue-500')
        expect(estados).toContain('text-[color:var(--chat-read)]')
    })
})
