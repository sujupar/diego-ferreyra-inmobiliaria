import { describe, it, expect, vi } from 'vitest'

// `create-funnel-lead.ts` importa (transitivamente, vía las notificaciones) el
// paquete `server-only`, que existe solo en el bundle de Next.js y no resuelve
// bajo el resolver de vitest (entorno node). `resolveFunnelMapping` es pura y no
// depende de nada de eso, así que stubbeamos `server-only` como módulo vacío para
// poder cargar el módulo y testear la función pura sin tocar el código de prod.
vi.mock('server-only', () => ({}))

import { resolveFunnelMapping } from './create-funnel-lead'

describe('resolveFunnelMapping', () => {
  it('tasacion → stage request, origin embudo, notify deal', () => {
    expect(resolveFunnelMapping('tasacion')).toEqual({
      stage: 'request',
      origin: 'embudo',
      placeholderLabel: 'Solicitud de tasación',
      notify: 'deal',
    })
  })

  it('clase → stage clase_gratuita, origin clase_gratuita, notify class', () => {
    expect(resolveFunnelMapping('clase')).toEqual({
      stage: 'clase_gratuita',
      origin: 'clase_gratuita',
      placeholderLabel: 'Clase Gratuita',
      notify: 'class',
    })
  })
})
