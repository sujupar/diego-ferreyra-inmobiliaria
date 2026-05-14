import { Composition } from 'remotion'
import { PropertyTour, type PropertyTourProps } from './PropertyTour'

// Cast helper — el strict typing de Composition en Remotion 4.x espera
// LooseComponentType<Record<string, unknown>>. El runtime sigue tipando
// correctamente los props al component.
const PropertyTourLoose = PropertyTour as unknown as React.FC<Record<string, unknown>>

const defaultProps: PropertyTourProps = {
  title: 'Departamento 3 ambientes',
  subtitle: 'Palermo · CABA',
  price: 'USD 180.000',
  highlights: [
    '3 ambientes · 2 dormitorios',
    'Cocina integrada · Balcón al frente',
    'Pileta · Parrilla · SUM',
  ],
  photos: [
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1920',
    'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1920',
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1920',
    'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1920',
  ],
  ctaText: 'Más info en inmodf.com.ar',
  brandName: 'Diego Ferreyra Inmobiliaria',
}

const FPS = 30
const SECONDS_PER_PHOTO = 3

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="PropertyTour"
        component={PropertyTourLoose}
        durationInFrames={(defaultProps.photos.length * SECONDS_PER_PHOTO + 2) * FPS}
        fps={FPS}
        width={1080}
        height={1080}
        defaultProps={defaultProps}
        calculateMetadata={({ props }) => ({
          durationInFrames:
            (((props as unknown as PropertyTourProps).photos?.length ?? 1) * SECONDS_PER_PHOTO + 2) * FPS,
        })}
      />
      {/* 9:16 vertical para Instagram Stories / Reels / TikTok */}
      <Composition
        id="PropertyTourVertical"
        component={PropertyTourLoose}
        durationInFrames={(defaultProps.photos.length * SECONDS_PER_PHOTO + 2) * FPS}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ ...defaultProps, vertical: true }}
        calculateMetadata={({ props }) => ({
          durationInFrames:
            (((props as unknown as PropertyTourProps).photos?.length ?? 1) * SECONDS_PER_PHOTO + 2) * FPS,
        })}
      />
    </>
  )
}
