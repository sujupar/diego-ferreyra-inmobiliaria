import { describe, expect, it } from 'vitest'
import { leerEnlaceDrive } from './enlace'

const ID = '1AbC_dEf-GhIjKlMnOpQrStUvWxYz0123'

describe('leerEnlaceDrive', () => {
  it('reconoce una carpeta', () => {
    expect(leerEnlaceDrive(`https://drive.google.com/drive/folders/${ID}`)).toEqual({ id: ID, tipo: 'carpeta' })
  })

  it('reconoce una carpeta abierta con otra cuenta (/u/1/) y la versión del celular', () => {
    expect(leerEnlaceDrive(`https://drive.google.com/drive/u/1/folders/${ID}?usp=sharing`)).toEqual({ id: ID, tipo: 'carpeta' })
    expect(leerEnlaceDrive(`https://drive.google.com/drive/mobile/folders/${ID}`)).toEqual({ id: ID, tipo: 'carpeta' })
  })

  it('reconoce un archivo', () => {
    expect(leerEnlaceDrive(`https://drive.google.com/file/d/${ID}/view?usp=drive_link`)).toEqual({ id: ID, tipo: 'archivo' })
  })

  it('con open?id= o uc?id= no se sabe si es carpeta o archivo', () => {
    expect(leerEnlaceDrive(`https://drive.google.com/open?id=${ID}`)).toEqual({ id: ID, tipo: 'desconocido' })
    expect(leerEnlaceDrive(`https://drive.google.com/uc?id=${ID}&export=download`)).toEqual({ id: ID, tipo: 'desconocido' })
  })

  it('conserva la clave de recurso de los enlaces viejos', () => {
    expect(leerEnlaceDrive(`https://drive.google.com/drive/folders/${ID}?resourcekey=0-abcDEF_12`)).toEqual({
      id: ID,
      tipo: 'carpeta',
      resourceKey: '0-abcDEF_12',
    })
  })

  it('tolera espacios alrededor y la falta de https', () => {
    expect(leerEnlaceDrive(`  drive.google.com/drive/folders/${ID}  `)).toEqual({ id: ID, tipo: 'carpeta' })
  })

  it('rechaza dominios que solo se parecen a Drive', () => {
    expect(leerEnlaceDrive(`https://drive.google.com.evil.com/drive/folders/${ID}`)).toBeNull()
    expect(leerEnlaceDrive(`https://evil.com/drive.google.com/drive/folders/${ID}`)).toBeNull()
    expect(leerEnlaceDrive(`https://evildrive.google.com/drive/folders/${ID}`)).toBeNull()
  })

  it('rechaza http sin cifrar', () => {
    expect(leerEnlaceDrive(`http://drive.google.com/drive/folders/${ID}`)).toBeNull()
  })

  it('rechaza identificadores con caracteres que no usa Drive', () => {
    expect(leerEnlaceDrive('https://drive.google.com/drive/folders/abc%27%20or%201')).toBeNull()
    expect(leerEnlaceDrive("https://drive.google.com/open?id=abc' in parents")).toBeNull()
  })

  it('rechaza vacío, texto suelto y enlaces de Drive sin identificador', () => {
    expect(leerEnlaceDrive('')).toBeNull()
    expect(leerEnlaceDrive('hola')).toBeNull()
    expect(leerEnlaceDrive('https://drive.google.com/drive/my-drive')).toBeNull()
  })
})
