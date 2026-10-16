/**
 * Link vencido, inventado o de una visita reabierta (criterio 23): un mensaje amable que NO dice
 * nada de la visita, la propiedad ni la persona. Componente de servidor (sin estado).
 */
const TEXTOS = {
  vencida: {
    titulo: 'Este link venció',
    cuerpo: 'Los links de la encuesta duran 30 días. Si querés contarnos qué te pareció la visita, respondé el WhatsApp de la visita.',
  },
  no_disponible: {
    titulo: 'Este link no está disponible',
    cuerpo: 'Puede que esté incompleto o mal copiado. Si querés contarnos qué te pareció la visita, respondé el WhatsApp de la visita.',
  },
  error: {
    titulo: 'No pudimos abrir la encuesta',
    cuerpo: 'Probá de nuevo en un rato. Si sigue sin abrir, respondé el WhatsApp de la visita.',
  },
} as const

export function EncuestaNoDisponible({ motivo }: { motivo: keyof typeof TEXTOS }) {
  const t = TEXTOS[motivo]
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col justify-center gap-3 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <h1 className="text-2xl font-semibold">{t.titulo}</h1>
      <p className="text-base text-muted-foreground">{t.cuerpo}</p>
      <p className="text-sm text-muted-foreground">Diego Ferreyra Inmobiliaria</p>
    </main>
  )
}
