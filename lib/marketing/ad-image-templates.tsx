/**
 * Templates JSX para el OVERLAY tipográfico de las piezas Meta Ads.
 *
 * Pipeline 2-stage:
 *  - Stage A (Gemini Image): procesa SOLO la foto. Sin texto, sin logos.
 *  - Stage B (estos templates + satori): compone el texto vectorial con
 *    fuentes reales sobre la foto procesada.
 *
 * Cada template recibe TemplateProps tipado y devuelve un nodo JSX que
 * satori convierte a SVG. Los strings (precio, headline, specs, propertyType,
 * neighborhood) son INMUTABLES — no pasan por ningún modelo IA, por lo que
 * NO pueden tener errores ortográficos (era el bug "Departamenton").
 *
 * Comparación tamaño/zoning vs prompts viejos:
 *  - feed_square 1080×1080 (1:1) — Facebook + Instagram feed
 *  - feed_vertical 1080×1350 (4:5) — Instagram feed (mejor scroll-stop)
 *  - story_vertical 1080×1920 (9:16) — Stories + Reels (con safe zones)
 */

import type { ReactNode } from 'react'

export type CompositionStyle =
  | 'hero_full_bleed'
  | 'split_photo_info'
  | 'editorial_magazine'
  | 'minimalist_whitespace'
  | 'color_overlay_solid'
  | 'typography_dominant'

export type AdFormat = 'feed_square' | 'feed_vertical' | 'story_vertical'

export interface TemplateProps {
  format: AdFormat
  /** Base64 data URL de la foto procesada por Gemini, ej. data:image/jpeg;base64,... */
  photoDataUrl: string
  /** Tokens inmutables — vienen de la DB / config, NO de un modelo */
  tokens: {
    propertyType: string // "Departamento", "Casa", "PH"
    headline: string // sanitizado, ≤60 chars
    price: string // "USD 285.000" formatted
    specs: string // "4 amb · 95 m² · piso 5 · Palermo"
    neighborhood: string // "Palermo"
  }
  /** Paleta del mood — controlada por código, no por IA */
  palette: {
    bg: string // background sólido (paleta crema/blanco)
    text: string // texto principal (charcoal)
    accent: string // color para detalles (navy, dorado, etc.)
    photoOverlay?: string // overlay sobre foto si necesario
  }
}

const DIM: Record<AdFormat, { width: number; height: number }> = {
  feed_square: { width: 1080, height: 1080 },
  feed_vertical: { width: 1080, height: 1350 },
  story_vertical: { width: 1080, height: 1920 },
}

// Story 9:16 safe zones: Instagram tapa top 250px (barra progreso) y
// bottom 380px (perfil + link sticker). El texto IMPORTANTE debe vivir
// en y=250..1540.
const STORY_SAFE_TOP = 250
const STORY_SAFE_BOTTOM = 380

// ============================================================
// 1) SPLIT_PHOTO_INFO — el conservador, Sotheby's-style
// ============================================================
function splitPhotoInfoTemplate(p: TemplateProps): ReactNode {
  const { width, height } = DIM[p.format]
  const isStory = p.format === 'story_vertical'
  // Story 9:16: y=0..250 (top safe, vacío), y=250..960 foto, y=960..1540 info,
  // y=1540..1920 bottom safe (vacío). El info panel queda íntegramente en zona
  // visible — antes el cálculo lo mandaba a y=1510..1920 (tapado por la UI IG).
  // Feed 1:1 / 4:5: 62% foto + 38% info panel (sin safe zones — IG no tapa).
  const usableStoryH = isStory ? height - STORY_SAFE_TOP - STORY_SAFE_BOTTOM : 0
  const photoHeight = isStory ? Math.round(usableStoryH * 0.55) : Math.round(height * 0.62)

  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: p.palette.bg,
        fontFamily: 'Inter',
      }}
    >
      {isStory && <div style={{ width, height: STORY_SAFE_TOP, backgroundColor: p.palette.bg }} />}
      <img
        src={p.photoDataUrl}
        style={{
          width,
          height: photoHeight,
          objectFit: 'cover',
        }}
      />
      <div
        style={{
          // Story: info panel ocupa el resto del usable. Feed: flex:1 sobre el 38% restante.
          height: isStory ? usableStoryH - photoHeight : undefined,
          flex: isStory ? undefined : 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          paddingLeft: 80,
          paddingRight: 80,
          paddingTop: 50,
          paddingBottom: 50,
          backgroundColor: p.palette.bg,
        }}
      >
        <div
          style={{
            fontSize: isStory ? 38 : 30,
            fontWeight: 600,
            color: p.palette.accent,
            letterSpacing: 4,
            textTransform: 'uppercase',
            marginBottom: 14,
          }}
        >
          {p.tokens.propertyType} en {p.tokens.neighborhood}
        </div>
        <div
          style={{
            fontSize: isStory ? 56 : 52,
            fontWeight: 700,
            color: p.palette.text,
            lineHeight: 1.1,
            marginBottom: 22,
            maxWidth: width - 160,
          }}
        >
          {p.tokens.headline}
        </div>
        <div
          style={{
            fontSize: isStory ? 68 : 64,
            fontWeight: 700,
            color: p.palette.text,
            letterSpacing: -1,
            marginBottom: 18,
          }}
        >
          {p.tokens.price}
        </div>
        <div
          style={{
            fontSize: isStory ? 28 : 26,
            fontWeight: 400,
            color: p.palette.text,
            opacity: 0.7,
          }}
        >
          {p.tokens.specs}
        </div>
      </div>
      {isStory && <div style={{ width, height: STORY_SAFE_BOTTOM, backgroundColor: p.palette.bg }} />}
    </div>
  )
}

// ============================================================
// 2) HERO_FULL_BLEED — foto 100% con gradient overlay para texto
// ============================================================
function heroFullBleedTemplate(p: TemplateProps): ReactNode {
  const { width, height } = DIM[p.format]
  const isStory = p.format === 'story_vertical'
  const textBlockTop = isStory ? height - STORY_SAFE_BOTTOM - 380 : height - 360
  const textBlockHeight = isStory ? 380 : 360

  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        position: 'relative',
        fontFamily: 'Inter',
      }}
    >
      <img
        src={p.photoDataUrl}
        style={{
          width,
          height,
          objectFit: 'cover',
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: textBlockTop,
          left: 0,
          width,
          height: textBlockHeight,
          // satori soporta backgroundImage con linear-gradient (no el shorthand
          // background). El shorthand puede no parsearse y dejar texto blanco
          // sin contraste sobre foto clara.
          backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.65) 60%, rgba(0,0,0,0.85) 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          paddingLeft: 80,
          paddingRight: 80,
          paddingBottom: 80,
        }}
      >
        <div
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.85)',
            letterSpacing: 3,
            textTransform: 'uppercase',
            marginBottom: 14,
          }}
        >
          {p.tokens.neighborhood}
        </div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            color: '#FFFFFF',
            lineHeight: 1.1,
            marginBottom: 22,
            maxWidth: width - 160,
          }}
        >
          {p.tokens.headline}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              color: '#FFFFFF',
              letterSpacing: -1,
            }}
          >
            {p.tokens.price}
          </div>
        </div>
        <div
          style={{
            fontSize: 24,
            fontWeight: 400,
            color: 'rgba(255,255,255,0.75)',
            marginTop: 12,
          }}
        >
          {p.tokens.specs}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 3) EDITORIAL_MAGAZINE — Cormorant Garamond + Inter (AD-tier)
// ============================================================
function editorialMagazineTemplate(p: TemplateProps): ReactNode {
  const { width, height } = DIM[p.format]
  const isStory = p.format === 'story_vertical'
  const photoTop = isStory ? STORY_SAFE_TOP + 60 : 80
  const photoH = isStory ? height - STORY_SAFE_BOTTOM - photoTop - 380 : Math.round(height * 0.5)
  const padding = 80

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: p.palette.bg,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Inter',
        paddingTop: photoTop,
        paddingLeft: padding,
        paddingRight: padding,
        paddingBottom: padding,
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 400,
          color: p.palette.text,
          opacity: 0.6,
          letterSpacing: 6,
          textTransform: 'uppercase',
          marginBottom: 30,
        }}
      >
        Diego Ferreyra · Boutique · CABA
      </div>
      <img
        src={p.photoDataUrl}
        style={{
          width: width - padding * 2,
          height: photoH,
          objectFit: 'cover',
          marginBottom: 36,
        }}
      />
      <div
        style={{
          fontFamily: 'Cormorant Garamond',
          fontSize: isStory ? 76 : 64,
          fontWeight: 400,
          color: p.palette.text,
          lineHeight: 1.05,
          marginBottom: 24,
          maxWidth: width - padding * 2 - 100,
        }}
      >
        {p.tokens.headline}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          width: '100%',
        }}
      >
        <div
          style={{
            fontSize: 24,
            fontWeight: 400,
            color: p.palette.text,
            opacity: 0.75,
            maxWidth: width * 0.55,
          }}
        >
          {p.tokens.specs}
        </div>
        <div
          style={{
            fontSize: 52,
            fontWeight: 700,
            color: p.palette.accent,
            letterSpacing: -0.5,
          }}
        >
          {p.tokens.price}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 4) MINIMALIST_WHITESPACE — foto pequeña + mucho aire
// ============================================================
function minimalistWhitespaceTemplate(p: TemplateProps): ReactNode {
  const { width, height } = DIM[p.format]
  const isStory = p.format === 'story_vertical'
  const photoSize = Math.round(width * 0.5)
  const photoTop = isStory ? STORY_SAFE_TOP + 100 : 100
  const photoLeft = Math.round((width - photoSize) / 2)

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: p.palette.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        fontFamily: 'Inter',
        position: 'relative',
      }}
    >
      <img
        src={p.photoDataUrl}
        style={{
          width: photoSize,
          height: photoSize,
          objectFit: 'cover',
          marginTop: photoTop,
        }}
      />
      <div
        style={{
          marginTop: 80,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingLeft: 80,
          paddingRight: 80,
        }}
      >
        <div
          style={{
            fontSize: 22,
            // 600 (no 500): satori solo recibe 400/600/700 — 500 cae al
            // fallback 400 y el eyebrow queda anémico vs los otros templates.
            fontWeight: 600,
            color: p.palette.text,
            opacity: 0.6,
            letterSpacing: 5,
            textTransform: 'uppercase',
            marginBottom: 28,
          }}
        >
          {p.tokens.neighborhood}
        </div>
        <div
          style={{
            fontSize: 50,
            fontWeight: 600,
            color: p.palette.text,
            lineHeight: 1.15,
            textAlign: 'center',
            marginBottom: 36,
            maxWidth: width - 200,
          }}
        >
          {p.tokens.headline}
        </div>
        <div
          style={{
            fontSize: 60,
            fontWeight: 700,
            color: p.palette.accent,
            letterSpacing: -1,
            marginBottom: 20,
          }}
        >
          {p.tokens.price}
        </div>
        <div
          style={{
            fontSize: 26,
            fontWeight: 400,
            color: p.palette.text,
            opacity: 0.65,
            textAlign: 'center',
          }}
        >
          {p.tokens.specs}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 5) COLOR_OVERLAY_SOLID — Hermès/Aman vibe
// ============================================================
function colorOverlaySolidTemplate(p: TemplateProps): ReactNode {
  const { width, height } = DIM[p.format]
  const isStory = p.format === 'story_vertical'
  const overlayWidth = Math.round(width * 0.42)
  const overlayHeight = isStory
    ? Math.round((height - STORY_SAFE_BOTTOM - STORY_SAFE_TOP) * 0.55)
    : Math.round(height * 0.45)
  const overlayBottom = isStory ? STORY_SAFE_BOTTOM + 60 : 60
  const overlayLeft = 60

  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        position: 'relative',
        fontFamily: 'Inter',
      }}
    >
      <img
        src={p.photoDataUrl}
        style={{
          width,
          height,
          objectFit: 'cover',
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: overlayBottom,
          left: overlayLeft,
          width: overlayWidth,
          height: overlayHeight,
          backgroundColor: p.palette.bg,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 42,
        }}
      >
        <div
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: p.palette.accent,
            letterSpacing: 3,
            textTransform: 'uppercase',
          }}
        >
          {p.tokens.propertyType}
        </div>
        <div
          style={{
            fontSize: 42,
            fontWeight: 700,
            color: p.palette.text,
            lineHeight: 1.15,
            marginTop: 16,
            marginBottom: 16,
          }}
        >
          {p.tokens.headline}
        </div>
        <div>
          <div
            style={{
              fontSize: 50,
              fontWeight: 700,
              color: p.palette.text,
              letterSpacing: -0.5,
              marginBottom: 12,
            }}
          >
            {p.tokens.price}
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 400,
              color: p.palette.text,
              opacity: 0.7,
            }}
          >
            {p.tokens.specs}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 6) TYPOGRAPHY_DOMINANT — texto hero, foto mini
// ============================================================
function typographyDominantTemplate(p: TemplateProps): ReactNode {
  const { width, height } = DIM[p.format]
  const isStory = p.format === 'story_vertical'
  const padding = 80
  const photoSize = isStory ? 280 : 240
  const heroTop = isStory ? STORY_SAFE_TOP + 80 : 120

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: p.palette.bg,
        display: 'flex',
        flexDirection: 'column',
        padding,
        paddingTop: heroTop,
        fontFamily: 'Inter',
      }}
    >
      <div
        style={{
          fontFamily: 'Cormorant Garamond',
          fontSize: isStory ? 130 : 110,
          fontWeight: 700,
          color: p.palette.text,
          lineHeight: 0.92,
          letterSpacing: -2,
          maxWidth: width - padding * 2,
        }}
      >
        {p.tokens.headline}
      </div>
      <div
        style={{
          marginTop: 50,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <img
          src={p.photoDataUrl}
          style={{
            width: photoSize,
            height: photoSize,
            objectFit: 'cover',
            marginRight: 32,
          }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: p.palette.accent,
              letterSpacing: 4,
              textTransform: 'uppercase',
              marginBottom: 12,
            }}
          >
            {p.tokens.propertyType} · {p.tokens.neighborhood}
          </div>
          <div
            style={{
              fontSize: 48,
              fontWeight: 700,
              color: p.palette.text,
              letterSpacing: -0.5,
              marginBottom: 12,
            }}
          >
            {p.tokens.price}
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 400,
              color: p.palette.text,
              opacity: 0.65,
            }}
          >
            {p.tokens.specs}
          </div>
        </div>
      </div>
    </div>
  )
}

const TEMPLATES: Record<CompositionStyle, (p: TemplateProps) => ReactNode> = {
  split_photo_info: splitPhotoInfoTemplate,
  hero_full_bleed: heroFullBleedTemplate,
  editorial_magazine: editorialMagazineTemplate,
  minimalist_whitespace: minimalistWhitespaceTemplate,
  color_overlay_solid: colorOverlaySolidTemplate,
  typography_dominant: typographyDominantTemplate,
}

export function renderTemplate(
  style: CompositionStyle,
  props: TemplateProps,
): ReactNode {
  const fn = TEMPLATES[style] ?? splitPhotoInfoTemplate
  return fn(props)
}

export function getDimensions(format: AdFormat): { width: number; height: number } {
  return DIM[format]
}
