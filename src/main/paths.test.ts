import { describe, expect, it } from 'vitest'
import { relativeToBase, resolvePhotoFolder } from './paths'

describe('resolvePhotoFolder', () => {
  const winBase = 'D:\\Show'
  it('löst relative Angaben unter Windows gegen den Programmordner auf', () => {
    expect(resolvePhotoFolder('Fotos', winBase, 'win32')).toBe('D:\\Show\\Fotos')
    expect(resolvePhotoFolder('./Fotos', winBase, 'win32')).toBe('D:\\Show\\Fotos')
    expect(resolvePhotoFolder('/Fotos', winBase, 'win32')).toBe('D:\\Show\\Fotos')
    expect(resolvePhotoFolder('\\Fotos\\2024', winBase, 'win32')).toBe('D:\\Show\\Fotos\\2024')
    expect(resolvePhotoFolder('..\\Bilder', winBase, 'win32')).toBe('D:\\Bilder')
  })

  it('lässt absolute Pfade unter Windows unverändert', () => {
    expect(resolvePhotoFolder('C:\\Users\\x\\Pictures', winBase, 'win32')).toBe(
      'C:\\Users\\x\\Pictures'
    )
    expect(resolvePhotoFolder('C:/Users/x/Pictures', winBase, 'win32')).toBe(
      'C:\\Users\\x\\Pictures'
    )
    expect(resolvePhotoFolder('\\\\nas\\fotos', winBase, 'win32')).toBe('\\\\nas\\fotos\\')
  })

  it('löst unter Linux relative Angaben auf, absolute bleiben', () => {
    expect(resolvePhotoFolder('Fotos', '/opt/show', 'linux')).toBe('/opt/show/Fotos')
    expect(resolvePhotoFolder('./Fotos', '/opt/show', 'linux')).toBe('/opt/show/Fotos')
    expect(resolvePhotoFolder('/home/x/Bilder', '/opt/show', 'linux')).toBe('/home/x/Bilder')
  })

  it('liefert leer für leere Angabe', () => {
    expect(resolvePhotoFolder('  ', winBase, 'win32')).toBe('')
  })
})

describe('relativeToBase', () => {
  it('erkennt Ordner innerhalb des Programmordners', () => {
    expect(relativeToBase('D:\\Show\\Fotos', 'D:\\Show', 'win32')).toBe('Fotos')
    expect(relativeToBase('D:\\Andere', 'D:\\Show', 'win32')).toBeNull()
    expect(relativeToBase('D:\\Show', 'D:\\Show', 'win32')).toBeNull()
  })
})
