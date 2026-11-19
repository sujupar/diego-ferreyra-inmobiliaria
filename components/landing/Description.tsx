import { TextoConFormato } from './TextoConFormato'

interface DescriptionProps {
  text: string
}

export function LandingDescription({ text }: DescriptionProps) {
  return (
    <section className="py-12 md:py-16 px-6 md:px-12 lg:px-20 max-w-3xl mx-auto">
      <h2 className="text-2xl md:text-3xl font-medium mb-6">Sobre esta propiedad</h2>
      <div className="space-y-4 text-base md:text-lg leading-relaxed text-foreground/90">
        <TextoConFormato texto={text} />
      </div>
    </section>
  )
}
