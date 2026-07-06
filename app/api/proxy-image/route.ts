import { NextResponse } from 'next/server'
import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
import { requireAuth } from '@/lib/auth/require-role'

/**
 * Proxy de imágenes usado SOLO por el generador de PDF client-side
 * (lib/pdf/imageUtils.ts) para inlinear fotos de portal/Storage como data URL.
 *
 * Endurecido contra SSRF: requiere sesión, bloquea rangos de IP privados/reservados
 * (incluida la metadata de la nube 169.254.169.254) resolviendo el hostname ANTES
 * y DESPUÉS de cada redirect, limita el tamaño de la respuesta y exige contenido de imagen.
 */

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const MAX_REDIRECTS = 3
const FETCH_TIMEOUT_MS = 10000

/** Convierte una IP (v4 o v6) a decisión privada/reservada = no ruteable públicamente. */
function isBlockedIp(ip: string): boolean {
    const fam = isIP(ip)
    if (fam === 0) return true // no es IP válida → bloquear por las dudas

    // IPv4-mapped IPv6 (::ffff:a.b.c.d) → evaluar como IPv4
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
    if (mapped) return isBlockedIp(mapped[1])

    if (fam === 4) {
        const o = ip.split('.').map(Number)
        if (o.length !== 4 || o.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true
        const [a, b] = o
        if (a === 0) return true                    // 0.0.0.0/8
        if (a === 10) return true                   // 10/8 privado
        if (a === 127) return true                  // loopback
        if (a === 169 && b === 254) return true     // link-local + metadata nube
        if (a === 172 && b >= 16 && b <= 31) return true // 172.16/12
        if (a === 192 && b === 168) return true     // 192.168/16
        if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64/10
        if (a === 192 && b === 0) return true        // 192.0.0/24 + 192.0.2/24
        if (a === 198 && (b === 18 || b === 19)) return true // benchmark 198.18/15
        if (a === 198 && b === 51) return true        // 198.51.100/24 (TEST-NET-2)
        if (a === 203 && b === 0) return true         // 203.0.113/24 (TEST-NET-3)
        if (a >= 224) return true                     // multicast + reservado + broadcast
        return false
    }

    // IPv6
    const low = ip.toLowerCase()
    if (low === '::' || low === '::1') return true       // unspecified / loopback
    if (low.startsWith('fe80') || low.startsWith('fe9') || low.startsWith('fea') || low.startsWith('feb')) return true // link-local fe80::/10
    if (low.startsWith('fc') || low.startsWith('fd')) return true // ULA fc00::/7
    if (low.startsWith('ff')) return true                // multicast
    return false
}

/** Resuelve el hostname y bloquea si CUALQUIER dirección resuelta es privada/reservada. */
async function assertPublicHost(hostname: string): Promise<void> {
    let candidates: string[]
    if (isIP(hostname) !== 0) {
        candidates = [hostname]
    } else {
        const results = await lookup(hostname, { all: true })
        candidates = results.map((r) => r.address)
        if (candidates.length === 0) throw new Error('unresolvable host')
    }
    for (const ip of candidates) {
        if (isBlockedIp(ip)) throw new Error('blocked host')
    }
}

export async function POST(request: Request): Promise<Response> {
    await requireAuth()
    try {
        const { url } = await request.json()

        if (!url || typeof url !== 'string') {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 })
        }

        // Seguir redirects manualmente re-validando el host en cada salto (evita bypass
        // por redirect a un destino interno).
        let currentUrl = url
        let response: Response | null = null
        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
            let parsed: URL
            try {
                parsed = new URL(currentUrl)
            } catch {
                return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
            }
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                return NextResponse.json({ error: 'Only HTTP/HTTPS URLs allowed' }, { status: 400 })
            }

            try {
                await assertPublicHost(parsed.hostname)
            } catch {
                return NextResponse.json({ error: 'URL not allowed' }, { status: 400 })
            }

            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
            let res: Response
            try {
                res = await fetch(parsed.toString(), {
                    signal: controller.signal,
                    redirect: 'manual',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                        Accept: 'image/*',
                    },
                })
            } finally {
                clearTimeout(timer)
            }

            // Redirect: re-validar destino en la próxima iteración
            if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
                currentUrl = new URL(res.headers.get('location')!, parsed).toString()
                continue
            }
            response = res
            break
        }

        if (!response) {
            return NextResponse.json({ error: 'Too many redirects' }, { status: 502 })
        }
        if (!response.ok) {
            return NextResponse.json({ error: `Failed to fetch image: ${response.status}` }, { status: 502 })
        }

        // Defensa contra usar el proxy para exfiltrar HTML/JSON internos.
        const contentType = response.headers.get('content-type') || ''
        const ctMain = contentType.split(';')[0].trim().toLowerCase()
        if (ctMain && !ctMain.startsWith('image/') && ctMain !== 'application/octet-stream') {
            return NextResponse.json({ error: 'Not an image' }, { status: 415 })
        }

        // Cap de tamaño: por content-length y por bytes reales leídos.
        const declared = Number(response.headers.get('content-length') || '0')
        if (declared && declared > MAX_BYTES) {
            return NextResponse.json({ error: 'Image too large' }, { status: 413 })
        }
        const buffer = Buffer.from(await response.arrayBuffer())
        if (buffer.byteLength > MAX_BYTES) {
            return NextResponse.json({ error: 'Image too large' }, { status: 413 })
        }

        const outType = ctMain.startsWith('image/') ? ctMain : 'image/jpeg'
        const dataUrl = `data:${outType};base64,${buffer.toString('base64')}`
        return NextResponse.json({ dataUrl })
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            return NextResponse.json({ error: 'Image fetch timed out' }, { status: 504 })
        }
        console.error('Proxy image error:', error)
        return NextResponse.json({ error: 'Failed to proxy image' }, { status: 500 })
    }
}
