import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanDuplicates } from './dupesClean'

let dir = ''
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

async function setup(): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), 'pp-dupes-'))
  await mkdir(join(dir, 'Urlaub'))
  await writeFile(join(dir, 'a.jpg'), 'a')
  await writeFile(join(dir, 'Urlaub', 'b.jpg'), 'b')
  return dir
}

describe('cleanDuplicates', () => {
  it('verschiebt in „Duplicates“ mit gleicher Ordnerstruktur und freien Namen', async () => {
    const folder = await setup()
    await mkdir(join(folder, 'Duplicates'))
    await writeFile(join(folder, 'Duplicates', 'a.jpg'), 'alt')
    const result = await cleanDuplicates(
      folder,
      ['a.jpg', join('Urlaub', 'b.jpg')],
      'move',
      async () => {}
    )
    expect(result.done).toBe(2)
    expect(result.failed).toEqual([])
    expect((await readdir(join(folder, 'Duplicates'))).sort()).toEqual([
      'Urlaub',
      'a (2).jpg',
      'a.jpg'
    ])
    expect(await readdir(join(folder, 'Duplicates', 'Urlaub'))).toEqual(['b.jpg'])
    expect(await readdir(folder)).not.toContain('a.jpg')
  })

  it('legt beim Löschen über die übergebene Funktion in den Papierkorb', async () => {
    const folder = await setup()
    const trashed: string[] = []
    const result = await cleanDuplicates(folder, ['a.jpg'], 'trash', async (p) => {
      trashed.push(p)
    })
    expect(result.done).toBe(1)
    expect(trashed).toEqual([join(folder, 'a.jpg')])
  })

  it('fasst nichts außerhalb des Fotoordners an und meldet fehlende Dateien', async () => {
    const folder = await setup()
    const result = await cleanDuplicates(folder, ['../x.jpg', 'fehlt.jpg'], 'move', async () => {})
    expect(result.done).toBe(0)
    expect(result.failed).toEqual(['../x.jpg', 'fehlt.jpg'])
  })
})
