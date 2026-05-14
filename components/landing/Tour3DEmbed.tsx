interface Tour3DProps {
  url: string
}

export function LandingTour3DEmbed({ url }: Tour3DProps) {
  return (
    <section className="py-12 md:py-16 px-6 md:px-12 lg:px-20 max-w-5xl mx-auto">
      <h2 className="text-2xl md:text-3xl font-medium mb-2">Tour 3D</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Recorré la propiedad como si estuvieras adentro.
      </p>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        <iframe
          src={url}
          className="absolute inset-0 h-full w-full"
          allow="xr-spatial-tracking; vr; accelerometer; gyroscope; fullscreen"
          allowFullScreen
          loading="lazy"
          title="Tour 3D de la propiedad"
        />
      </div>
    </section>
  )
}
