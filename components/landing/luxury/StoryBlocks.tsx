/**
 * E1.9 — Bloques de historia (I/II/III), foto y texto ALTERNADOS, con marco
 * desplazado (.lx-frame). Beneficios intangibles/emocionales al dolor. Server
 * component. Si un bloque no tiene foto, va a texto centrado (nunca roto).
 */
interface StoryItem {
  numeral: string
  eyebrow: string
  headline: string
  body: string
  photo?: string
}

export function StoryBlocks({ items }: { items: StoryItem[] }) {
  if (!items?.length) return null
  return (
    <section className="mx-auto max-w-6xl px-6 py-20 md:px-12 md:py-28 lg:px-16">
      {items.map((item, i) => {
        const flip = i % 2 === 1 // alterna el lado de la foto
        const hasPhoto = Boolean(item.photo)
        return (
          <article
            key={i}
            className={`lx-reveal mb-20 grid items-center gap-10 last:mb-0 md:mb-28 md:gap-16 ${
              hasPhoto ? 'md:grid-cols-2' : 'md:grid-cols-1'
            }`}
          >
            {hasPhoto && (
              <figure className={`lx-frame ${flip ? 'md:order-2' : ''}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.photo}
                  alt=""
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
              </figure>
            )}
            <div className={hasPhoto ? '' : 'mx-auto max-w-2xl text-center'}>
              <div
                className="text-lg tracking-[0.3em]"
                style={{ fontFamily: 'var(--lx-serif)', color: 'var(--lx-navy)' }}
              >
                {item.numeral}
              </div>
              <p className="lx-eyebrow mt-4">{item.eyebrow}</p>
              <h2 className="mt-3 text-3xl leading-[1.15] md:text-[2.6rem]">{item.headline}</h2>
              <p className="mt-5 max-w-[52ch] text-base leading-relaxed md:text-lg" style={{ color: 'var(--lx-ink-soft)' }}>
                {item.body}
              </p>
            </div>
          </article>
        )
      })}
    </section>
  )
}
