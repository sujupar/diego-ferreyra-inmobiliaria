import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center text-center p-8 bg-background">
      <div className="max-w-md">
        <p className="text-sm tracking-widest text-muted-foreground uppercase">404</p>
        <h1 className="text-4xl font-medium mt-3">Propiedad no encontrada</h1>
        <p className="text-muted-foreground mt-4">
          Este enlace puede haber expirado o la propiedad ya no está disponible
          en el mercado.
        </p>
        <Link
          href="https://inmodf.com.ar"
          className="inline-block mt-8 text-sm underline text-[color:var(--brand)]"
        >
          Ir al sitio principal
        </Link>
      </div>
    </main>
  )
}
