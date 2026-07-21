/**
 * Compositor: mapea un slide del guion (layout/accent/copy/items/imagen) a los
 * layouts del kit y devuelve el PNG 1080×1350. Es el puente entre el guion de
 * OpenAI y la identidad visual de Fase 0.
 */
import { h, renderSlide, type El } from './render'
import { C, eyebrow, footer, paginator, splitSlide, cinematicBase, darkBase, content, spacer, stars, leakCard, SCRIM } from './kit'
import type { ScriptSlide } from './brand-bible'
import { cropTestimonial } from './testimonios'

export interface ComposeOpts { page: number; total: number }

const accentColor = (a: ScriptSlide['accent']) => (a === 'red' ? C.red : a === 'green' ? C.greenBright : '#ffffff')
const clean = (kids: (El | null | undefined)[]): El[] => kids.filter(Boolean) as El[]

const titleEl = (text: string, size: number, color = '#ffffff'): El =>
  h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: size, lineHeight: 1.12, letterSpacing: -1, color, marginTop: 12 } }, text)
const bodyEl = (text: string, color = C.onDark): El =>
  h('div', { style: { fontFamily: 'Lato', fontWeight: 400, fontSize: 32, lineHeight: 1.44, color, marginTop: 16 } }, text)
const ctaButton = (label: string): El =>
  h('div', { style: { display: 'flex', marginTop: 28 } },
    h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 29, letterSpacing: 0.2, color: '#062416', backgroundColor: C.greenBright, padding: '26px 36px', borderRadius: 14 } }, label))

/** Renderiza un slide del guion a PNG. `scene` = data URI de la imagen (concept/diego) si aplica. */
export async function composeSlide(slide: ScriptSlide, scene: string | undefined, opts: ComposeOpts): Promise<Buffer> {
  const el = await buildSlideEl(slide, scene, opts)
  return renderSlide(el)
}

async function buildSlideEl(slide: ScriptSlide, scene: string | undefined, opts: ComposeOpts): Promise<El> {
  const swipe = opts.page < opts.total
  const ac = accentColor(slide.accent)

  if (slide.layout === 'split') {
    return splitSlide({
      page: opts.page,
      total: opts.total,
      scene,
      panel: clean([
        slide.eyebrow ? eyebrow(slide.eyebrow, ac === '#ffffff' ? C.greenBright : ac) : null,
        slide.title ? titleEl(slide.title, 52) : null,
        slide.body ? h('div', { style: { fontFamily: 'Lato', fontWeight: 400, fontSize: 29, lineHeight: 1.42, color: C.onDark, marginTop: 16 } }, slide.body) : null,
        slide.cta_label ? ctaButton(slide.cta_label) : null,
        footer({ logoText: 'DIEGO FERREYRA', swipe }),
      ]),
    })
  }

  if (slide.layout === 'infographic') {
    return cinematicBase(scene, SCRIM.full, clean([
      paginator(opts.page, opts.total, true),
      slide.eyebrow ? eyebrow(slide.eyebrow, ac) : null,
      slide.title ? h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 56, lineHeight: 1.14, letterSpacing: -0.5, color: '#ffffff', marginTop: 22 } }, slide.title) : null,
      h('div', { style: { display: 'flex', flex: 1, alignItems: 'center' } },
        h('div', { style: { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', width: '100%' } },
          ...slide.items.map((it) => leakCard(it.icon, it.label)))),
      footer({ swipe }),
    ]))
  }

  if (slide.layout === 'testimonial') {
    const t = await cropTestimonial(slide.testimonial_key)
    return darkBase([
      paginator(opts.page, opts.total, true),
      content(clean([
        eyebrow(slide.eyebrow || 'Testimonio real', C.greenBright),
        h('div', { style: { display: 'flex', flex: 1, alignItems: 'center' } },
          h('div', { style: { display: 'flex', flexDirection: 'row', alignItems: 'flex-start', width: '100%' } },
            h('div', { style: { width: 300, height: 392, borderRadius: 26, overflow: 'hidden', display: 'flex', flexShrink: 0, marginRight: 46, borderWidth: 3, borderStyle: 'solid', borderColor: 'rgba(21,214,122,0.55)' } },
              t?.photo ? h('img', { src: t.photo, style: { width: '100%', height: '100%', objectFit: 'cover' } }) : h('div', { style: { width: '100%', height: '100%', backgroundColor: '#16324c' } })),
            h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1 } },
              stars(5, C.greenBright),
              h('div', { style: { fontFamily: 'Montserrat', fontWeight: 700, fontSize: 40, lineHeight: 1.32, letterSpacing: -0.5, color: '#ffffff', marginTop: 22 } }, `“${t?.quote || slide.body || slide.title}”`),
              h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 30, color: '#ffffff', marginTop: 26 } }, t?.name || ''),
              h('div', { style: { fontFamily: 'Lato', fontWeight: 400, fontSize: 25, color: C.onDarkSoft, marginTop: 3 } }, t?.roleLabel || ''),
            ),
          )),
        footer({ swipe }),
      ])),
    ])
  }

  // default: cinematic (imagen conceptual full-bleed + texto abajo)
  return cinematicBase(scene, SCRIM.bottom, clean([
    paginator(opts.page, opts.total, true),
    spacer(),
    slide.eyebrow ? eyebrow(slide.eyebrow, ac) : null,
    slide.title ? titleEl(slide.title, slide.role === 'hook' ? 64 : 58) : null,
    slide.body ? bodyEl(slide.body) : null,
    slide.role === 'cta' && slide.cta_label ? ctaButton(slide.cta_label) : null,
    footer({ swipe }),
  ]))
}
