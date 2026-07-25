/**
 * E1.6 — Probe de pickPublishSource (pura, sin DB).
 * Correr: node --env-file=.env.local --import tsx scripts/landing-editor-promote.probe.ts
 */
import { pickPublishSource } from '../lib/landing/editor/promote'

const a = pickPublishSource({ content: { c: 1 }, draft_content: null })
if (a.promoteDraft !== false || (a.source as { c: number }).c !== 1)
  throw new Error('sin draft debe usar content')

const b = pickPublishSource({ content: { c: 1 }, draft_content: { c: 2 } })
if (b.promoteDraft !== true || (b.source as { c: number }).c !== 2)
  throw new Error('con draft debe promover el draft')

// draft_content vacío (objeto) NO es null → cuenta como borrador.
const c = pickPublishSource({ content: { c: 1 }, draft_content: {} })
if (c.promoteDraft !== true) throw new Error('draft {} debe contar como borrador')

console.log('OK pickPublishSource')
