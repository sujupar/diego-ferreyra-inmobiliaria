/**
 * E1.8 — Showcase del beneficio principal + slides de imágenes que lo refuerzan.
 * Server component. Las imágenes se resuelven por índice desde property.photos.
 */
interface ShowcaseProps {
  headline: string
  body?: string
  photos: string[]
}

export function LandingBenefitShowcase({ headline, body, photos }: ShowcaseProps) {
  const imgs = photos.slice(0, 4)
  return (
    <section className="mx-auto max-w-6xl px-6 py-16 md:px-12 md:py-24 lg:px-20">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl md:text-5xl">{headline}</h2>
        {body && (
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            {body}
          </p>
        )}
      </div>

      {imgs.length > 0 && (
        <div className="mt-12 grid gap-3 md:grid-cols-2 md:gap-4">
          {imgs.map((src, i) => (
            <div
              key={i}
              className={`overflow-hidden rounded-2xl ${
                imgs.length >= 3 && i === 0 ? 'md:row-span-2 md:h-full' : ''
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                loading="lazy"
                className="h-64 w-full object-cover transition-transform duration-700 hover:scale-105 md:h-full md:min-h-[18rem]"
              />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
