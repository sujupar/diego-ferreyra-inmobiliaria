/**
 * E1.6 — Probe de render estático del editor: EditorPreview + EditorPanel.
 * Verifica estructura (overlays de selección, ring, panels por tipo) SIN navegador.
 * Correr: node --env-file=.env.local --import tsx scripts/landing-editor-preview.probe.tsx
 */
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { EditorPreview } from '@/components/landing/editor/EditorPreview'
import { EditorPanel } from '@/components/landing/editor/EditorPanel'
import { luxuryTemplate } from '@/lib/landing/templates/luxury'
import type { LandingProperty } from '@/lib/landing/registry'
import type { LandingBlock } from '@/lib/landing/schema'

const property = {
  id: 'p1', title: 'Depto de prueba', property_type: 'departamento', neighborhood: 'Palermo',
  city: 'CABA', operation_type: 'venta', asking_price: 250000, currency: 'USD',
  photos: ['https://x/0.jpg', 'https://x/1.jpg', 'https://x/2.jpg', 'https://x/3.jpg'],
  description: 'Hermoso depto.',
} as unknown as LandingProperty

const doc = luxuryTemplate.build(property)

// 1) Preview: overlays de selección + ring del seleccionado.
const html = renderToStaticMarkup(
  React.createElement(EditorPreview, { document: doc, property, selectedId: 'hero', onSelect: () => {} }),
)
if (!html.includes('lx-editor-preview')) throw new Error('falta la clase lx-editor-preview')
if (!html.includes('data-block-id="hero"')) throw new Error('no envolvió el bloque hero')
if (!html.includes('Editar sección')) throw new Error('faltan los overlays de selección')
if (!html.includes('ring-[color:var(--brand)]')) throw new Error('no marcó el bloque seleccionado')

// 2) EditorPanel por tipo: hero (Titular), story (Bloque I), stats (se arma sola).
const heroBlock = doc.blocks.find((b) => b.id === 'hero') as LandingBlock
const storyBlock = doc.blocks.find((b) => b.id === 'story') as LandingBlock
const statsBlock = doc.blocks.find((b) => b.id === 'stats') as LandingBlock

const heroPanel = renderToStaticMarkup(
  React.createElement(EditorPanel, { block: heroBlock, property, onChange: () => {} }),
)
if (!heroPanel.includes('Titular')) throw new Error('HeroPanel no muestra el campo Titular')
if (!heroPanel.includes('Foto de portada')) throw new Error('HeroPanel no muestra el selector de portada')

const storyPanel = renderToStaticMarkup(
  React.createElement(EditorPanel, { block: storyBlock, property, onChange: () => {} }),
)
if (!storyPanel.includes('Bloque I')) throw new Error('StoryBlocksPanel no muestra Bloque I')

const statsPanel = renderToStaticMarkup(
  React.createElement(EditorPanel, { block: statsBlock, property, onChange: () => {} }),
)
if (!statsPanel.includes('se arma sola')) throw new Error('InfoPanel de stats no aparece')

console.log('OK EditorPreview + EditorPanel (render estático)')
