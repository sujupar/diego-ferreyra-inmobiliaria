import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { parseWebhookPayload, verifySignature } from './webhook'

// Payload real de un mensaje de texto entrante (Cloud API v21.0).
const TEXT_MESSAGE_PAYLOAD = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '123456789',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '5491100000000', phone_number_id: '999' },
            contacts: [{ profile: { name: 'Federico' }, wa_id: '5491122334455' }],
            messages: [
              {
                from: '5491122334455',
                id: 'wamid.HBgLNTQ5MTEyMjMzNDQ1NQ==',
                timestamp: '1732900000',
                type: 'text',
                text: { body: 'Hola, quería consultar por la propiedad' },
              },
            ],
          },
          field: 'messages',
        },
      ],
    },
  ],
}

// Payload real de una actualización de estado `delivered`.
const STATUS_DELIVERED_PAYLOAD = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '123456789',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '5491100000000', phone_number_id: '999' },
            statuses: [
              {
                id: 'wamid.HBgLNTQ5MTEyMjMzNDQ1NQ==',
                status: 'delivered',
                timestamp: '1732900010',
                recipient_id: '5491122334455',
                conversation: { id: 'abc', origin: { type: 'utility' } },
                pricing: { billable: true, pricing_model: 'CBP', category: 'utility' },
              },
            ],
          },
          field: 'messages',
        },
      ],
    },
  ],
}

const STATUS_FAILED_PAYLOAD = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '123456789',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '5491100000000', phone_number_id: '999' },
            statuses: [
              {
                id: 'wamid.FAILED123==',
                status: 'failed',
                timestamp: '1732900020',
                recipient_id: '5491122334455',
                errors: [{ code: 131026, title: 'Message Undeliverable', message: 'Message Undeliverable' }],
              },
            ],
          },
          field: 'messages',
        },
      ],
    },
  ],
}

describe('parseWebhookPayload', () => {
  it('parsea un mensaje de texto entrante', () => {
    const { inbound, statuses } = parseWebhookPayload(TEXT_MESSAGE_PAYLOAD)
    expect(statuses).toHaveLength(0)
    expect(inbound).toHaveLength(1)
    expect(inbound[0]).toMatchObject({
      waMessageId: 'wamid.HBgLNTQ5MTEyMjMzNDQ1NQ==',
      from: '5491122334455',
      contactName: 'Federico',
      type: 'text',
      bodyPreview: 'Hola, quería consultar por la propiedad',
      timestamp: '1732900000',
    })
  })

  it('parsea una actualización de estado delivered', () => {
    const { inbound, statuses } = parseWebhookPayload(STATUS_DELIVERED_PAYLOAD)
    expect(inbound).toHaveLength(0)
    expect(statuses).toHaveLength(1)
    expect(statuses[0]).toMatchObject({
      waMessageId: 'wamid.HBgLNTQ5MTEyMjMzNDQ1NQ==',
      status: 'delivered',
      timestamp: '1732900010',
      errorCode: null,
      errorMessage: null,
    })
  })

  it('parsea un estado failed con detalle de error', () => {
    const { statuses } = parseWebhookPayload(STATUS_FAILED_PAYLOAD)
    expect(statuses).toHaveLength(1)
    expect(statuses[0].status).toBe('failed')
    expect(statuses[0].errorCode).toBe('131026')
    expect(statuses[0].errorMessage).toBe('Message Undeliverable')
  })

  it('no descarta mensajes no-texto: imagen', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ profile: { name: 'Claudia' }, wa_id: '5491122334455' }],
                messages: [
                  {
                    from: '5491122334455',
                    id: 'wamid.IMG1==',
                    timestamp: '1732900030',
                    type: 'image',
                    image: { id: 'media123', mime_type: 'image/jpeg', caption: 'Mirá esto' },
                  },
                ],
              },
            },
          ],
        },
      ],
    }
    const { inbound } = parseWebhookPayload(payload)
    expect(inbound).toHaveLength(1)
    expect(inbound[0].type).toBe('image')
    expect(inbound[0].bodyPreview).toBe('[imagen] Mirá esto')
  })

  it('no descarta mensajes no-texto: audio, sin caption', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { from: '5491122334455', id: 'wamid.AUD1==', timestamp: '1732900040', type: 'audio', audio: { id: 'm1' } },
                ],
              },
            },
          ],
        },
      ],
    }
    const { inbound } = parseWebhookPayload(payload)
    expect(inbound).toHaveLength(1)
    expect(inbound[0].bodyPreview).toBe('[audio]')
    expect(inbound[0].contactName).toBeNull()
  })

  it('no descarta ubicación compartida', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: '5491122334455',
                    id: 'wamid.LOC1==',
                    timestamp: '1732900050',
                    type: 'location',
                    location: { latitude: -34.6, longitude: -58.4, name: 'Palermo' },
                  },
                ],
              },
            },
          ],
        },
      ],
    }
    const { inbound } = parseWebhookPayload(payload)
    expect(inbound[0].bodyPreview).toBe('[ubicación] Palermo')
  })

  it('devuelve listas vacías si no hay entry', () => {
    expect(parseWebhookPayload({ object: 'whatsapp_business_account' })).toEqual({ inbound: [], statuses: [] })
  })

  it('devuelve listas vacías ante payload no-objeto o null', () => {
    expect(parseWebhookPayload(null)).toEqual({ inbound: [], statuses: [] })
    expect(parseWebhookPayload('garbage')).toEqual({ inbound: [], statuses: [] })
    expect(parseWebhookPayload(undefined)).toEqual({ inbound: [], statuses: [] })
  })

  it('ignora entries/changes con shape roto sin lanzar', () => {
    expect(() => parseWebhookPayload({ entry: [{ changes: [{ value: null }] }] })).not.toThrow()
    expect(() => parseWebhookPayload({ entry: [null, { changes: 'not-an-array' }] })).not.toThrow()
    expect(() => parseWebhookPayload({ entry: [{ changes: [{ value: { messages: [{ from: '55' }] } }] }] })).not.toThrow()
  })

  it('descarta un mensaje individual sin id o from pero no rompe el resto', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { from: '5491122334455' /* sin id */ },
                  { id: 'wamid.OK==', from: '5491122334455', timestamp: '1', type: 'text', text: { body: 'ok' } },
                ],
              },
            },
          ],
        },
      ],
    }
    const { inbound } = parseWebhookPayload(payload)
    expect(inbound).toHaveLength(1)
    expect(inbound[0].waMessageId).toBe('wamid.OK==')
  })
})

describe('verifySignature', () => {
  const secret = 'test-app-secret'
  const raw = JSON.stringify(TEXT_MESSAGE_PAYLOAD)

  function sign(body: string, appSecret: string): string {
    return 'sha256=' + createHmac('sha256', appSecret).update(body, 'utf8').digest('hex')
  }

  it('firma válida', () => {
    expect(verifySignature(raw, sign(raw, secret), secret)).toBe(true)
  })

  it('firma inválida (secret distinto)', () => {
    expect(verifySignature(raw, sign(raw, 'otro-secret'), secret)).toBe(false)
  })

  it('firma inválida (body distinto al firmado)', () => {
    const wrongSig = sign(raw, secret)
    expect(verifySignature(raw + 'x', wrongSig, secret)).toBe(false)
  })

  it('header ausente', () => {
    expect(verifySignature(raw, null, secret)).toBe(false)
  })

  it('fail closed: sin WHATSAPP_APP_SECRET configurado devuelve false aunque la firma matchee', () => {
    // appSecret undefined/null/'' — el llamador nunca debería aceptar un
    // payload en este caso, aunque el header traiga una firma válida para
    // OTRO secret cualquiera.
    expect(verifySignature(raw, sign(raw, ''), undefined)).toBe(false)
    expect(verifySignature(raw, sign(raw, secret), null)).toBe(false)
    expect(verifySignature(raw, sign(raw, secret), '')).toBe(false)
  })

  it('header sin el prefijo sha256= también funciona', () => {
    const hex = sign(raw, secret).replace('sha256=', '')
    expect(verifySignature(raw, hex, secret)).toBe(true)
  })

  it('header con hex inválido no lanza y devuelve false', () => {
    expect(verifySignature(raw, 'sha256=not-hex-!!', secret)).toBe(false)
    expect(verifySignature(raw, 'sha256=', secret)).toBe(false)
  })
})
