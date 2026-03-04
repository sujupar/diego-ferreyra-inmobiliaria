interface ImageHolder {
    images?: string[] | null
}

async function convertUrlToBase64(url: string): Promise<string> {
    if (!url || url.startsWith('data:')) return url

    try {
        const res = await fetch('/api/proxy-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        })

        if (!res.ok) return ''

        const { dataUrl } = await res.json()
        return dataUrl || ''
    } catch {
        return ''
    }
}

export async function convertImagesToBase64(
    subject: ImageHolder,
    comparables: ImageHolder[],
    overpriced: ImageHolder[] = []
): Promise<{ subjectImages: string[], comparableImages: string[][], overpricedImages: string[][] }> {
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

    const [subjectImages, ...restImages] = await Promise.all([
        subjectPromise,
        ...comparablePromises,
        ...overpricedPromises,
    ])

    const comparableImages = restImages.slice(0, comparables.length)
    const overpricedImages = restImages.slice(comparables.length)

    return { subjectImages, comparableImages, overpricedImages }
}
