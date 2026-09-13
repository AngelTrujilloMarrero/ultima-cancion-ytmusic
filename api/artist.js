// Sync MANUAL por artista (YouTube Music, no vídeos):
// GET /api/artist?name=Armonía Show
// 1) Busca en data/artists.json (channelId ya resuelto) o localiza el canal
//    "<Artista> - Topic" scrapeando la búsqueda de YouTube (0 cuota).
// 2) Lee su RSS y devuelve las 2 últimas canciones.
import { fetchChannelRSS, loadArtists } from './_rss.js'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const norm = (s = '') =>
  s
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')

const decode = (s = '') =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')

async function findTopicChannel(name) {
  const target = norm(name)
  for (const q of [`${name} - Topic`, `${name} Topic`]) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    try {
      const res = await fetch(
        `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
        { headers: { 'User-Agent': UA }, signal: ctrl.signal },
      )
      if (!res.ok) continue
      const html = await res.text()
      const pairs = [
        ...html.matchAll(
          /"text":"([^"]{2,60}?)","navigationEndpoint":\{"clickTrackingParams".*?"browseId":"(UC[^"]+)"/g,
        ),
      ].map((m) => ({ text: m[1], id: m[2] }))
      const topics = pairs.filter((p) => norm(p.text).endsWith('- topic'))
      if (!topics.length) continue
      const freq = new Map()
      for (const p of topics) freq.set(p.id + '|' + p.text, (freq.get(p.id + '|' + p.text) ?? 0) + 1)
      // 1) match exacto: "<nombre> - Topic"
      const exact = [...freq.entries()]
        .filter(([k]) => norm(k.split('|')[1].replace(/- topic$/i, '').trim()) === target)
        .sort((a, b) => b[1] - a[1])[0]
      if (exact) {
        const [id, text] = exact[0].split('|')
        return { channelId: id, channelTitle: text }
      }
      // 2) contiene el nombre
      const loose = [...freq.entries()]
        .filter(([k]) => norm(k.split('|')[1]).includes(target))
        .sort((a, b) => b[1] - a[1])[0]
      if (loose) {
        const [id, text] = loose[0].split('|')
        return { channelId: id, channelTitle: text }
      }
    } catch {
      // siguiente query
    } finally {
      clearTimeout(t)
    }
  }
  return null
}

export default async function handler(req, res) {
  const raw = req.query?.name ?? new URL(req.url, 'http://x').searchParams.get('name') ?? ''
  const name = String(raw).trim()
  if (!name) return res.status(400).json({ error: 'Falta ?name=' })

  const artists = await loadArtists(process.cwd())
  const entry = artists.find((a) => norm(a.name) === norm(name)) ?? artists.find((a) => norm(a.normalized) === norm(name))

  let channelId = entry?.channelId ?? null
  let channelTitle = entry ? `${entry.name} - Topic` : `${name} - Topic`

  if (!channelId) {
    const found = await findTopicChannel(entry?.name ?? name)
    if (!found) {
      return res.status(404).json({
        name: entry?.name ?? name,
        temas: entry?.temas ?? 0,
        topic: null,
        message: 'Este artista no tiene canal en YouTube Music (sin "- Topic"). Solo existen vídeos sueltos.',
      })
    }
    channelId = found.channelId
    channelTitle = found.channelTitle
  }

  const rss = await fetchChannelRSS(channelId)
  if (!rss.ok) return res.status(502).json({ error: `RSS falló: ${rss.reason}` })

  const latest = rss.videos.slice(0, 2).map((v) => ({
    videoId: v.videoId,
    title: decode(v.title),
    publishedAt: v.publishedAt,
    urlMusic: `https://music.youtube.com/watch?v=${v.videoId}`,
    urlYoutube: `https://www.youtube.com/watch?v=${v.videoId}`,
    thumb: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
  }))

  return res.status(200).json({
    name: entry?.name ?? name,
    temas: entry?.temas ?? 0,
    channelId,
    channelTitle,
    source: 'youtube-music',
    latest,
  })
}
