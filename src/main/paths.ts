import path from 'node:path'

/**
 * Löst den eingestellten Fotoordner auf. Relative Angaben („Fotos“, „./Fotos“) beziehen
 * sich auf den Programmordner. Unter Windows gilt auch „/Fotos“ (ohne Laufwerk) als relativ,
 * weil man damit üblicherweise „neben dem Programm“ meint.
 */
export function resolvePhotoFolder(
  setting: string,
  base: string,
  platform: NodeJS.Platform = process.platform
): string {
  const p = setting.trim()
  if (!p) return ''
  if (platform === 'win32') {
    const win = path.win32
    if (/^[\\/](?![\\/])/.test(p)) return win.resolve(base, p.slice(1))
    return win.isAbsolute(p) ? win.normalize(p) : win.resolve(base, p)
  }
  const posix = path.posix
  return posix.isAbsolute(p) ? posix.normalize(p) : posix.resolve(base, p)
}

/** Liegt `folder` innerhalb von `base`? Dann der relative Pfad, sonst null. */
export function relativeToBase(
  folder: string,
  base: string,
  platform: NodeJS.Platform = process.platform
): string | null {
  const lib = platform === 'win32' ? path.win32 : path.posix
  const rel = lib.relative(base, folder)
  if (!rel || rel.startsWith('..') || lib.isAbsolute(rel)) return null
  return rel
}
