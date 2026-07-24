/**
 * E1.8 — "Sobre esta propiedad": storytelling emocional. Server component.
 * Respeta saltos de párrafo del body.
 */
export function LandingStory({ title, body }: { title: string; body: string }) {
  if (!body?.trim()) return null
  const paras = body.split(/\n{2,}|\n/).map(p => p.trim()).filter(Boolean)
  return (
    <section className="mx-auto max-w-3xl px-6 py-16 md:px-12 md:py-24 lg:px-0">
      <h2 className="text-3xl md:text-4xl">{title}</h2>
      <div className="mt-6 space-y-4 text-lg leading-relaxed text-foreground/80">
        {paras.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </section>
  )
}
