import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'

export interface PropertyTourProps {
  title: string
  subtitle: string
  price: string
  highlights: string[]
  photos: string[]
  ctaText: string
  brandName: string
  vertical?: boolean
}

const SECONDS_PER_PHOTO = 3

export const PropertyTour: React.FC<PropertyTourProps> = (props) => {
  const { fps } = useVideoConfig()
  const photoFrames = SECONDS_PER_PHOTO * fps

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
      {/* Intro card (1s) */}
      <Sequence from={0} durationInFrames={fps}>
        <IntroCard {...props} />
      </Sequence>

      {/* Galería de fotos con ken burns + overlays */}
      {props.photos.map((photo, i) => (
        <Sequence
          key={i}
          from={fps + i * photoFrames}
          durationInFrames={photoFrames}
        >
          <PhotoSlide
            photo={photo}
            indexHint={`${i + 1} / ${props.photos.length}`}
            highlight={props.highlights[i % props.highlights.length]}
          />
        </Sequence>
      ))}

      {/* Outro card (1s) */}
      <Sequence
        from={fps + props.photos.length * photoFrames}
        durationInFrames={fps}
      >
        <OutroCard
          ctaText={props.ctaText}
          brandName={props.brandName}
          title={props.title}
        />
      </Sequence>
    </AbsoluteFill>
  )
}

const IntroCard: React.FC<PropertyTourProps> = ({ title, subtitle, price, brandName }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const slide = spring({ frame, fps, config: { damping: 20, stiffness: 80 } })
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 80,
        opacity,
      }}
    >
      <div
        style={{
          textAlign: 'center',
          transform: `translateY(${(1 - slide) * 40}px)`,
        }}
      >
        <p
          style={{
            fontSize: 24,
            letterSpacing: 8,
            color: '#9ca3af',
            margin: 0,
            textTransform: 'uppercase',
          }}
        >
          {brandName}
        </p>
        <h1
          style={{
            fontSize: 88,
            fontWeight: 600,
            color: 'white',
            margin: '24px 0 12px',
            letterSpacing: -2,
            lineHeight: 1,
          }}
        >
          {title}
        </h1>
        <p
          style={{
            fontSize: 36,
            color: '#d1d5db',
            margin: 0,
          }}
        >
          {subtitle}
        </p>
        <p
          style={{
            fontSize: 52,
            fontWeight: 500,
            color: '#fbbf24',
            marginTop: 48,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {price}
        </p>
      </div>
    </AbsoluteFill>
  )
}

const PhotoSlide: React.FC<{
  photo: string
  indexHint: string
  highlight: string
}> = ({ photo, indexHint, highlight }) => {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()

  // Ken Burns: zoom suave + pan
  const scale = interpolate(frame, [0, durationInFrames], [1, 1.12])
  const translateX = interpolate(frame, [0, durationInFrames], [0, -20])

  // Highlight chip slide-up
  const chipY = interpolate(frame, [0, 15], [40, 0], { extrapolateRight: 'clamp' })
  const chipOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{ backgroundColor: 'black', overflow: 'hidden' }}>
      <Img
        src={photo}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${scale}) translateX(${translateX}px)`,
        }}
      />
      {/* Gradient overlay para legibilidad */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.5) 100%)',
        }}
      />
      {/* Index hint top-right */}
      <div
        style={{
          position: 'absolute',
          top: 40,
          right: 40,
          color: 'white',
          fontSize: 22,
          fontWeight: 500,
          backgroundColor: 'rgba(0,0,0,0.4)',
          padding: '8px 16px',
          borderRadius: 999,
          backdropFilter: 'blur(8px)',
        }}
      >
        {indexHint}
      </div>
      {/* Highlight chip bottom-left */}
      <div
        style={{
          position: 'absolute',
          bottom: 60,
          left: 60,
          color: 'white',
          fontSize: 32,
          fontWeight: 500,
          maxWidth: '70%',
          opacity: chipOpacity,
          transform: `translateY(${chipY}px)`,
        }}
      >
        {highlight}
      </div>
    </AbsoluteFill>
  )
}

const OutroCard: React.FC<{ ctaText: string; brandName: string; title: string }> = ({
  ctaText,
  brandName,
  title,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const slide = spring({ frame, fps, config: { damping: 18, stiffness: 80 } })

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(135deg, #16213e 0%, #1a1a2e 100%)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 80,
      }}
    >
      <div
        style={{
          textAlign: 'center',
          transform: `translateY(${(1 - slide) * 30}px)`,
          opacity: slide,
        }}
      >
        <p
          style={{
            fontSize: 32,
            color: '#9ca3af',
            margin: 0,
          }}
        >
          ¿Te interesa?
        </p>
        <h2
          style={{
            fontSize: 76,
            fontWeight: 600,
            color: 'white',
            margin: '20px 0',
            letterSpacing: -1.5,
          }}
        >
          {title}
        </h2>
        <p
          style={{
            fontSize: 44,
            color: '#fbbf24',
            marginTop: 40,
            fontWeight: 500,
          }}
        >
          {ctaText}
        </p>
        <p
          style={{
            fontSize: 22,
            letterSpacing: 6,
            color: '#9ca3af',
            marginTop: 60,
            textTransform: 'uppercase',
          }}
        >
          {brandName}
        </p>
      </div>
    </AbsoluteFill>
  )
}
