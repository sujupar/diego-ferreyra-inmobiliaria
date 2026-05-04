interface ImageHolder {
    images?: string[] | null
}

/**
 * Cache module-level de URL → data URL base64.
 *
 * Las imágenes scrapeadas de portales (zonaprop, mercadolibre) tardan ~500ms-2s
 * por imagen via /api/proxy-image. Una tasación con 5 comparables + 2 overpriced
 * + 1 purchase puede demorar 5-15s en convertir TODO la primera vez.
 *
 * Este cache hace que la SEGUNDA apertura de la vista previa (sin recargar la
 * página) sea instantánea. También se beneficia el flujo "abrir → editar →
 * cerrar → reabrir" que usan los asesores.
 *
 * El cache se limpia naturalmente al recargar la página (module-level state).
 * Como las URLs de portales son estables, el cache no se invalida en sesión.
 */
const imageCache = new Map<string, string>()

/** Promesas en vuelo para evitar duplicar requests si se piden la misma URL en paralelo. */
const inflightRequests = new Map<string, Promise<string>>()

async function convertUrlToBase64(url: string): Promise<string> {
    if (!url || url.startsWith('data:')) return url

    // Cache hit: devolver instantáneo.
    const cached = imageCache.get(url)
    if (cached !== undefined) return cached

    // Request ya en vuelo: reutilizar la promesa para no duplicar.
    const inflight = inflightRequests.get(url)
    if (inflight) return inflight

    const promise = (async () => {
        try {
            const res = await fetch('/api/proxy-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            })

            if (!res.ok) return ''

            const { dataUrl } = await res.json()
            const result = dataUrl || ''
            // Cachear solo si la conversión fue exitosa — un fallo (string vacío)
            // puede ser transitorio (timeout, 503), conviene reintentar la próxima vez.
            if (result) imageCache.set(url, result)
            return result
        } catch {
            return ''
        } finally {
            inflightRequests.delete(url)
        }
    })()

    inflightRequests.set(url, promise)
    return promise
}

interface ConvertOptions {
    /** Callback que se invoca a medida que cada imagen completa.
     *  loaded: cantidad de imágenes ya procesadas. total: cantidad total a procesar. */
    onProgress?: (loaded: number, total: number) => void
}

export async function convertImagesToBase64(
    subject: ImageHolder,
    comparables: ImageHolder[],
    overpriced: ImageHolder[] = [],
    purchaseProperties: ImageHolder[] = [],
    options?: ConvertOptions,
): Promise<{
    subjectImages: string[]
    comparableImages: string[][]
    overpricedImages: string[][]
    purchaseImages: string[][]
}> {
    // Contar cuántas imágenes hay que procesar para el progress callback.
    const subjectHasImage = !!subject.images?.[0]
    const comparablesWithImage = comparables.filter(c => !!c.images?.[0]).length
    const overpricedWithImage = overpriced.filter(p => !!p.images?.[0]).length
    const purchaseWithImage = purchaseProperties.filter(p => !!p.images?.[0]).length
    const total = (subjectHasImage ? 1 : 0) + comparablesWithImage + overpricedWithImage + purchaseWithImage

    let loaded = 0
    const reportProgress = () => {
        loaded += 1
        options?.onProgress?.(loaded, total)
    }
    // Reportar al inicio para que el UI muestre "0 de N..." inmediatamente.
    options?.onProgress?.(0, total)

    const wrapWithProgress = (p: Promise<string>): Promise<string> =>
        p.then(result => {
            reportProgress()
            return result
        })

    const subjectPromise = subjectHasImage
        ? wrapWithProgress(convertUrlToBase64(subject.images![0])).then(img => [img])
        : Promise.resolve([] as string[])

    const comparablePromises = comparables.map(comp => {
        if (comp.images?.[0]) {
            return wrapWithProgress(convertUrlToBase64(comp.images[0]))
                .then(img => [img, ...(comp.images?.slice(1) || [])])
        }
        return Promise.resolve([] as string[])
    })

    const overpricedPromises = overpriced.map(prop => {
        if (prop.images?.[0]) {
            return wrapWithProgress(convertUrlToBase64(prop.images[0])).then(img => [img])
        }
        return Promise.resolve([] as string[])
    })

    // Purchase properties: scrapeadas de portales externos, sus URLs típicamente
    // bloquean hotlinking. Convertir a base64 vía proxy igual que comparables.
    const purchasePromises = purchaseProperties.map(prop => {
        if (prop.images?.[0]) {
            return wrapWithProgress(convertUrlToBase64(prop.images[0])).then(img => [img])
        }
        return Promise.resolve([] as string[])
    })

    const [subjectImages, ...restImages] = await Promise.all([
        subjectPromise,
        ...comparablePromises,
        ...overpricedPromises,
        ...purchasePromises,
    ])

    const comparableImages = restImages.slice(0, comparables.length)
    const overpricedImages = restImages.slice(comparables.length, comparables.length + overpriced.length)
    const purchaseImages = restImages.slice(comparables.length + overpriced.length)

    return { subjectImages, comparableImages, overpricedImages, purchaseImages }
}

/**
 * Pre-fetch silencioso de imágenes en background.
 *
 * Llamar esto cuando el usuario carga el detail page de una tasación: empieza
 * a convertir imágenes a base64 en background mientras el user lee la
 * información. Cuando hace click en "Vista Previa PDF", las imágenes ya están
 * en cache y la apertura del modal es instantánea.
 *
 * No bloquea, no devuelve nada — los resultados van al cache module-level.
 * Errores se ignoran silenciosamente (la conversión real al abrir el modal
 * los manejará).
 */
export function prefetchImagesInBackground(
    subject: ImageHolder,
    comparables: ImageHolder[],
    overpriced: ImageHolder[] = [],
    purchaseProperties: ImageHolder[] = [],
): void {
    const urls: string[] = []
    if (subject.images?.[0]) urls.push(subject.images[0])
    for (const c of comparables) if (c.images?.[0]) urls.push(c.images[0])
    for (const p of overpriced) if (p.images?.[0]) urls.push(p.images[0])
    for (const p of purchaseProperties) if (p.images?.[0]) urls.push(p.images[0])

    // Disparar conversiones sin await. Cualquier error se ignora porque el
    // modal real va a reintentar si hace falta.
    for (const url of urls) {
        if (url.startsWith('data:')) continue
        if (imageCache.has(url)) continue
        if (inflightRequests.has(url)) continue
        convertUrlToBase64(url).catch(() => { /* silencioso */ })
    }
}
