interface ImageHolder {
    images?: string[] | null
}

/**
 * Cache module-level simple de URL → data URL base64.
 * Persiste durante la sesión del browser para que re-abrir la vista previa
 * de una tasación ya procesada sea instantáneo.
 */
const imageCache = new Map<string, string>()

/** Timeout en ms para una imagen individual antes de darnos por vencidos. */
const PER_IMAGE_TIMEOUT_MS = 12000

async function convertUrlToBase64(url: string): Promise<string> {
    if (!url || url.startsWith('data:')) return url

    const cached = imageCache.get(url)
    if (cached !== undefined) return cached

    try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), PER_IMAGE_TIMEOUT_MS)

        const res = await fetch('/api/proxy-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
            signal: controller.signal,
        })
        clearTimeout(timer)

        if (!res.ok) return ''

        const { dataUrl } = await res.json()
        const result = dataUrl || ''
        if (result) imageCache.set(url, result)
        return result
    } catch {
        // Timeout, network error, etc — devolver string vacío para que el PDF
        // muestre placeholder en lugar de bloquear el render entero.
        return ''
    }
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

    // Purchase properties: scrapeadas de portales externos, sus URLs típicamente
    // bloquean hotlinking. Convertir a base64 vía proxy igual que comparables.
    const purchasePromises = purchaseProperties.map(prop => {
        if (prop.images?.[0]) {
            return convertUrlToBase64(prop.images[0]).then(img => [img])
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
