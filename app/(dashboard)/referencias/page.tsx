import Grilla from './grilla'

export default function ReferenciasPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Referencias de video</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Videos que están funcionando, con el porqué y cómo adaptarlos. Elegí uno y convertilo en guion con tu voz.
        </p>
      </div>
      <Grilla />
    </div>
  )
}
