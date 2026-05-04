interface ImageHolder {
    images?: string[] | null
}

/**
 * Cache module-level simple de URL → data URL base64.
 * Persiste durante la sesión del browser; re-abrir el preview de una tasación
 * ya procesada es instantáneo.
 */
const imageCache = new Map<string, string>()

/** Timeout per-image. Si una URL externa cuelga por más de esto, abortamos. */
const PER_IMAGE_TIMEOUT_MS = 8000

/** Hard deadline global para TODA la conversión. Si se cumple, devolvemos
 *  lo que tengamos hasta ahora — el PDF se renderiza con placeholders donde
 *  no haya imagen. */
const GLOBAL_TIMEOUT_MS = 25000

/**
 * Wraps a promise with a hard deadline. If the deadline expires first,
 * resolves with `fallback` instead of rejecting — el caller sigue corriendo.
 */
function withDeadline<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    return new Promise<T>(resolve => {
        let settled = false
        const timer = setTimeout(() => {
            if (!settled) {
                settled = true
                resolve(fallback)
            }
        }, ms)
        promise.then(
            value => {
                if (!settled) {
                    settled = true
                    clearTimeout(timer)
                    resolve(value)
                }
            },
            () => {
                if (!settled) {
                    settled = true
                    clearTimeout(timer)
                    resolve(fallback)
                }
            },
        )
    })
}

async function convertUrlToBase64(url: string): Promise<string> {
    if (!url || url.startsWith('data:')) return url

    const cached = imageCache.get(url)
    if (cached !== undefined) return cached

    const startTs = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const inner = (async () => {
        try {
            const controller = new AbortController()
            const fetchTimer = setTimeout(() => controller.abort(), PER_IMAGE_TIMEOUT_MS)
            const res = await fetch('/api/proxy-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
                signal: controller.signal,
            })
            clearTimeout(fetchTimer)
            if (!res.ok) {
                console.warn('[imageUtils] proxy responded', res.status, 'for', url.slice(0, 80))
                return ''
            }
            // res.json() NO es abortable con AbortSignal (la API no lo acepta).
            // Si el body se streamea lento, usamos withDeadline como protección real.
            const parsed = await withDeadline(
                res.json().catch(() => ({ dataUrl: undefined })) as Promise<{ dataUrl?: string }>,
                PER_IMAGE_TIMEOUT_MS,
                { dataUrl: undefined },
            )
            const result = parsed.dataUrl || ''
            if (result) imageCache.set(url, result)
            return result
        } catch (err) {
            const elapsed = Math.round(((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTs))
            console.warn(`[imageUtils] error after ${elapsed}ms for`, url.slice(0, 80), err)
            return ''
        }
    })()

    // Defensa adicional: si por cualquier razón el fetch+json sigue colgado,
    // cortamos a 1.5x el per-image timeout. Devuelve string vacío.
    return withDeadline(inner, PER_IMAGE_TIMEOUT_MS * 1.5, '')
}

export async function convertImagesToBase64(
    subject: ImageHolder,
    comparables: ImageHolder[],
    overpriced: ImageHolder[] = [],
    purchaseProperties: ImageHolder[] = [],
): Promise<{
    subjectImages: string[]
    comparableImages: string[][]
    overpricedImages: string[][]
    purchaseImages: string[][]
}> {
    const startTs = typeof performance !== 'undefined' ? performance.now() : Date.now()

    const subjectPromise = subject.images?.[0]
        ? convertUrlToBase64(subject.images[0]).then(img => [img])
        : Promise.resolve([] as string[])

    const comparablePromises = comparables.map(comp => {
        if (comp.images?.[0]) {
            return convertUrlToBase64(comp.images[0]).then(img => [img, ...(comp.images?.slice(1) || [])])
        }
        return Promise.resolve([] as string[])
    })

    const overpricedPromises = overpriced.map(prop => {
        if (prop.images?.[0]) {
            return convertUrlToBase64(prop.images[0]).then(img => [img])
        }
        return Promise.resolve([] as string[])
    })

    const purchasePromises = purchaseProperties.map(prop => {
        if (prop.images?.[0]) {
            return convertUrlToBase64(prop.images[0]).then(img => [img])
        }
        return Promise.resolve([] as string[])
    })

    // Hard deadline global. Si se cumple, devolvemos arrays vacíos para todo
    // lo que aún no haya completado y dejamos que el PDF se renderice con
    // placeholders en lugar de quedar colgado para siempre.
    const allPromise = Promise.all([
        subjectPromise,
        ...comparablePromises,
        ...overpricedPromises,
        ...purchasePromises,
    ])

    const total = comparables.length + overpriced.length + purchaseProperties.length + 1
    const fallback: string[][] = Array.from({ length: total }, () => [])

    const result = await withDeadline(allPromise, GLOBAL_TIMEOUT_MS, fallback)

    const elapsed = Math.round(((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTs))
    if (elapsed >= GLOBAL_TIMEOUT_MS) {
        console.warn(`[imageUtils] global timeout reached after ${elapsed}ms — rendering with whatever loaded`)
    } else {
        console.info(`[imageUtils] all images processed in ${elapsed}ms`)
    }

    const [subjectImages, ...restImages] = result
    const comparableImages = restImages.slice(0, comparables.length)
    const overpricedImages = restImages.slice(comparables.length, comparables.length + overpriced.length)
    const purchaseImages = restImages.slice(comparables.length + overpriced.length)

    return { subjectImages, comparableImages, overpricedImages, purchaseImages }
}
