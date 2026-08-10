export default function ThanksPage() {
  // `dvh` y no `screen` (=100vh): en iOS `vh` es el viewport grande y el centrado
  // queda corrido hacia abajo, con una barrita de scroll fantasma.
  return (
    <div className="min-h-dvh flex items-center justify-center p-6 bg-muted/30">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-3xl font-semibold">¡Gracias por tu respuesta!</h1>
        <p className="text-muted-foreground">Recibimos tus respuestas. Tu asesor las revisará en breve.</p>
      </div>
    </div>
  )
}
