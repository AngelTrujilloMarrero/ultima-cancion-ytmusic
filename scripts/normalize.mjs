// Regenera data/artists.json + public/data + formaciones.* desde el USB.
// Uso: USB_PATH=/Volumes/RED-SSD/MUSICA node scripts/normalize.mjs
import { readdir, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const usb = process.env.USB_PATH ?? '/Volumes/RED-SSD/MUSICA'

const norm = (s) =>
  s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')

const artistOf = (fn) => {
  const s = fn.replace(/\.mp3$/i, '')
  return s.includes(' - ') ? s.split(' - ')[0].trim() : s.split('-')[0].trim()
}

const files = (await readdir(usb)).filter((f) => f.toLowerCase().endsWith('.mp3'))
const counts = new Map()
const variants = new Map()
for (const f of files) {
  const a = artistOf(f)
  const n = norm(a)
  counts.set(n, (counts.get(n) ?? 0) + 1)
  if (!variants.has(n)) variants.set(n, new Map())
  variants.get(n).set(a, (variants.get(n).get(a) ?? 0) + 1)
}

const artists = [...counts.entries()]
  .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  .map(([n, c]) => {
    const v = [...variants.get(n).entries()].sort((a, b) => b[1] - a[1])
    return { name: v[0][0], normalized: n, temas: c, channelId: null, status: 'pending', variants: v.map(([x]) => x) }
  })

await mkdir(join(root, 'data'), { recursive: true })
await mkdir(join(root, 'public', 'data'), { recursive: true })
await writeFile(join(root, 'data', 'artists.json'), JSON.stringify(artists, null, 2))
await writeFile(join(root, 'public', 'data', 'artists.json'), JSON.stringify(artists, null, 2))
const names = artists.map((a) => a.name)
await writeFile(join(root, 'data', 'formaciones.json'), JSON.stringify(names, null, 2))
await writeFile(join(root, 'public', 'data', 'formaciones.json'), JSON.stringify(names, null, 2))
await writeFile(join(root, 'data', 'formaciones.txt'), names.join('\n') + '\n')
console.log(`OK ${artists.length} formaciones desde ${files.length} mp3`)
