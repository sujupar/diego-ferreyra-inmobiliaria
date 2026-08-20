import { describe, it, expect } from 'vitest'
import { resolverMedia, etiquetaDeTipo, resumenDeUltimoMensaje, type MensajeConMedia } from './media'

const base: MensajeConMedia = {
  body_preview: null, media_url: null, media_mime_type: null, media_filename: null, media_type: null,
}

describe('resolverMedia — mensajes SALIENTES (los que se veían como link crudo)', () => {
  it('una foto que mandó el sistema se resuelve como foto, sin mime', () => {
    // Este es EL caso del bug: `media_type` está, el mime no, y el componente
    // decidía por mime → la foto se dibujaba como documento.
    const r = resolverMedia({
      ...base,
      media_type: 'image',
      media_url: 'https://imgar.zonapropcdn.com/avisos/1/00/59/11/46/63/1200x1200/2052942732.jpg',
      body_preview: '[Foto] https://imgar.zonapropcdn.com/avisos/1/00/59/11/46/63/1200x1200/2052942732.jpg',
    })
    expect(r?.tipo).toBe('image')
    expect(r?.url).toContain('2052942732.jpg')
  })

  it('NUNCA deja una URL como epígrafe', () => {
    // Si el epígrafe fuera la URL, seguiríamos mostrando un link en pantalla.
    const r = resolverMedia({
      ...base, media_type: 'image', media_url: 'https://x.com/a.jpg', body_preview: '[Foto] https://x.com/a.jpg',
    })
    expect(r?.caption).toBeNull()
  })

  it('conserva el epígrafe cuando es texto de verdad', () => {
    const r = resolverMedia({
      ...base, media_type: 'image', media_url: 'https://x.com/a.jpg', body_preview: '[Foto] Frente de la casa',
    })
    expect(r?.caption).toBe('Frente de la casa')
  })

  it('el plano llega con su nombre real', () => {
    const r = resolverMedia({
      ...base,
      media_type: 'document',
      media_url: 'https://s.co/x/plano.pdf',
      media_filename: 'Entre Ríos 2333, Martínez, San Isidro - Planos.pdf',
    })
    expect(r?.tipo).toBe('document')
    expect(r?.filename).toBe('Entre Ríos 2333, Martínez, San Isidro - Planos.pdf')
  })

  it('sin nombre guardado, lo saca de la URL en vez de decir "archivo"', () => {
    const r = resolverMedia({ ...base, media_type: 'document', media_url: 'https://s.co/x/plano-1.pdf' })
    expect(r?.filename).toBe('plano-1.pdf')
  })

  it('el video se resuelve como video', () => {
    const r = resolverMedia({ ...base, media_type: 'video', media_url: 'https://s.co/v/a.mp4' })
    expect(r?.tipo).toBe('video')
  })
})

describe('resolverMedia — mensajes ENTRANTES (traen mime real)', () => {
  it('usa el mime cuando no hay columna semántica', () => {
    const r = resolverMedia({ ...base, media_mime_type: 'image/jpeg', media_url: 'inbound/wamid.abc.jpg' })
    expect(r?.tipo).toBe('image')
  })

  it('un mime desconocido es un documento, no un error', () => {
    const r = resolverMedia({ ...base, media_mime_type: 'application/octet-stream', media_url: 'inbound/x.bin' })
    expect(r?.tipo).toBe('document')
  })
})

describe('resolverMedia — el HISTORIAL, que no tiene columnas', () => {
  it('lee el prefijo del texto y recupera la foto', () => {
    // 17 mensajes reales quedaron así, de antes de que los envíos guardaran las
    // columnas. Sin esto, todo el historial se sigue viendo como texto crudo.
    const r = resolverMedia({ ...base, body_preview: '[Foto] https://imgar.zonapropcdn.com/a/b/2052942705.jpg' })
    expect(r?.tipo).toBe('image')
    expect(r?.url).toBe('https://imgar.zonapropcdn.com/a/b/2052942705.jpg')
    expect(r?.caption).toBeNull()
  })

  it('la extensión gana sobre la etiqueta si se contradicen', () => {
    const r = resolverMedia({ ...base, body_preview: '[Documento] https://s.co/x/foto.jpg' })
    expect(r?.tipo).toBe('image')
  })

  it('un documento viejo sin URL queda como ficha sin link, con su nombre', () => {
    const r = resolverMedia({ ...base, body_preview: '[Documento] plano-1.pdf' })
    expect(r?.tipo).toBe('document')
    expect(r?.url).toBeNull()
    expect(r?.filename).toBe('plano-1.pdf')
  })
})

describe('resolverMedia — lo que NO es un archivo', () => {
  it('un mensaje de texto normal devuelve null', () => {
    expect(resolverMedia({ ...base, body_preview: 'Hola, ¿cómo estás?' })).toBeNull()
  })

  it('un texto que arranca con corchetes pero no es una etiqueta conocida, tampoco', () => {
    // Las notas internas del agente empiezan con "[Agente IA]" y NO son archivos.
    expect(resolverMedia({ ...base, body_preview: '[Agente IA] Julian apagó el agente' })).toBeNull()
  })

  it('no explota con vacío', () => {
    expect(resolverMedia(base)).toBeNull()
    expect(resolverMedia({ ...base, body_preview: '' })).toBeNull()
  })
})

describe('etiquetaDeTipo', () => {
  it('se nombra en castellano, para el equipo', () => {
    expect(etiquetaDeTipo('image')).toBe('Foto')
    expect(etiquetaDeTipo('video')).toBe('Video')
    expect(etiquetaDeTipo('document')).toBe('Documento')
    expect(etiquetaDeTipo('audio')).toBe('Audio')
  })
})

describe('resumenDeUltimoMensaje — la lista de conversaciones', () => {
  it('una foto se lee "Foto", no una URL cortada por la mitad', () => {
    expect(resumenDeUltimoMensaje('[Foto] https://imgar.zonapropcdn.com/avisos/1/00/59/11/46/63/1200x1200/2052942732.jpg'))
      .toBe('Foto')
  })

  it('un plano muestra su nombre, que es lo que lo identifica', () => {
    expect(resumenDeUltimoMensaje('[Documento] Entre Ríos 2333 - Planos.pdf'))
      .toBe('Documento: Entre Ríos 2333 - Planos.pdf')
  })

  it('el video se lee "Video"', () => {
    expect(resumenDeUltimoMensaje('[Video] https://s.co/v/casa.mp4')).toBe('Video')
  })

  it('si había epígrafe, gana el epígrafe', () => {
    expect(resumenDeUltimoMensaje('[Foto] Frente de la casa')).toBe('Foto: Frente de la casa')
  })

  it('un mensaje de texto se muestra tal cual', () => {
    expect(resumenDeUltimoMensaje('Hola, ¿sigue disponible?')).toBe('Hola, ¿sigue disponible?')
  })

  it('una nota del agente NO se disfraza de archivo', () => {
    expect(resumenDeUltimoMensaje('[Agente IA] Sigue una persona.')).toBe('[Agente IA] Sigue una persona.')
  })

  it('sin mensaje devuelve null, para que la fila diga "(sin contenido)"', () => {
    expect(resumenDeUltimoMensaje(null)).toBeNull()
  })
})
