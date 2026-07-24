/**
 * E1.9 — Footer de MARCA (sin asesor). Nombre serif + prueba social CUCICBA +
 * contacto general + legal. Server component.
 */
export function FooterBrand() {
  const year = new Date().getFullYear()
  return (
    <footer
      className="border-t px-6 py-16 text-center"
      style={{ borderColor: 'var(--lx-line)', background: 'var(--lx-bg)' }}
    >
      <div className="mx-auto h-px w-14" style={{ background: 'var(--lx-navy)', opacity: 0.5 }} />
      <p className="mt-8 text-2xl md:text-3xl" style={{ fontFamily: 'var(--lx-serif)' }}>
        Diego Ferreyra Inmobiliaria
      </p>
      <p className="lx-eyebrow mt-4" style={{ color: 'var(--lx-ink-soft)' }}>
        Matriculado CUCICBA 8266
      </p>
      <div className="mt-6 flex flex-col items-center gap-2 text-sm" style={{ color: 'var(--lx-ink-soft)' }}>
        <a
          href="https://inmobiliariadiegoferreyra.com"
          target="_blank"
          rel="noopener"
          className="underline-offset-4 hover:underline"
        >
          inmobiliariadiegoferreyra.com
        </a>
      </div>
      <p className="mt-8 text-xs" style={{ color: 'var(--lx-ink-soft)' }}>
        © {year} Diego Ferreyra Inmobiliaria
      </p>
    </footer>
  )
}
