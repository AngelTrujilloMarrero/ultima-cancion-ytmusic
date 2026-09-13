// Vercel Cron: sync cada 2 días. Lee data/artists.json, pide RSS por canal (0 cuota),
// ordena por publishedAt desc y devuelve la playlist virtual. Persistir en Blob/KV
// es el siguiente paso cuando los channelId estén resueltos.
import { fetchChannelRSS, loadArtists } from './_rss.js'

const BATCH = 50

export default async function handler(req, res) {
  if (req.headers?.['x-vercel-cron-schedule'] === undefined && process.env.VERCEL === '1' && req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }
  const artists = await loadArtists(process.cwd())
  const withChannel = artists.filter((a) => a.channelId)
  const items = []
  const errors = []

  for (let i = 0; i < withChannel.length; i += BATCH) {
    const chunk = withChannel.slice(i, i + BATCH)
    const out = await Promise.allSettled(chunk.map(async (a) => {
      const r = await fetchChannelRSS(a.channelId)
      if (!r.ok) throw new Error(`${a.name}: ${r.reason}`)
      return r.videos.map((v) => ({ ...v, artist: a.name }))
    }))
    out.forEach((r) => {
      if (r.status === 'fulfilled') items.push(...r.value)
      else errors.push(String(r.reason?.message ?? r.reason))
    })
  }

  items.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))

  return res.status(200).json({
    updatedAt: new Date().toISOString(),
    artistsTotal: artists.length,
    channelsResolved: withChannel.length,
    itemsTotal: items.length,
    errors: errors.slice(0, 20),
    items: items.slice(0, 2000),
  })
}
