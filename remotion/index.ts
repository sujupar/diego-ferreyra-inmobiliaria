/**
 * Entry point de Remotion para los video tours de propiedades.
 *
 * Para preview con Remotion Studio:
 *   npx remotion preview remotion/index.ts
 *
 * Para renderizar localmente (genera MP4):
 *   npx remotion render remotion/index.ts PropertyTour out.mp4 --props='{...}'
 *
 * Para producción se recomienda Remotion Lambda o un servidor de render
 * dedicado. Ver docs/operations/remotion-rendering.md.
 */
import { registerRoot } from 'remotion'
import { Root } from './Root'

registerRoot(Root)
