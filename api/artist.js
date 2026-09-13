// Sync MANUAL por artista (YouTube Music, no vídeos):
// GET /api/artist?name=Armonía Show
// 1) Busca en data/artists.json (channelId ya resuelto) o localiza el canal
//    "<Artista> - Topic" scrapeando la búsqueda de YouTube (0 cuota).
// 2) Lee su RSS y devuelve las 2 últimas canciones.
import { fetchChannelRSS, loadArtists, loadUsbTitles, loadOverrides, overlapScore } from './_rss.js'
import { getLatestSingles, searchChannels } from './_ytm.js'

export const maxDuration = 30

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

const stripTopic = (t) => t.replace(/- (topic|tema)$/i, '').trim()
const isTopicTitle = (t) => /- (topic|tema)$/i.test(norm(t))

// Variantes del nombre oficial: el Topic a veces añade el prefijo
// ("Tropin" -> "Orquesta Tropin - Topic"). Solo prefijos de formación.
function nameVariants(name) {
  const base = norm(name)
  const out = [base]
  for (const pre of ['orquesta', 'grupo', 'sonora']) {
    if (!base.startsWith(pre + ' ')) out.push(`${pre} ${base}`)
  }
  return out
}

async function collectCandidates(name, variants) {
  const map = new Map()
  const add = (c) => {
    const cur = map.get(c.channelId)
    if (!cur) map.set(c.channelId, { ...c, freq: 1 })
    else {
      cur.freq += 1
      if (c.matched && variants.indexOf(c.matched) < variants.indexOf(cur.matched)) {
        cur.matched = c.matched
        cur.channelTitle = c.channelTitle
      }
    }
  }
  // Búsqueda de canales vía InnerTube (JSON ligero, ~10x más rápido que scrapear).
  // En español YouTube muestra "- Tema" en vez de "- Topic": es el mismo canal.
  const queries = [name, `Orquesta ${name}`, `Grupo ${name}`]
  for (const q of queries) {
    let chans = []
    try {
      chans = await searchChannels(q)
    } catch {
      continue
    }
    for (const ch of chans) {
      if (!isTopicTitle(ch.title)) continue
      const vi = variants.findIndex((v) => norm(stripTopic(ch.title)) === v)
      if (vi !== -1) add({ channelId: ch.channelId, channelTitle: ch.title, matched: variants[vi] })
    }
    if (map.size) break // si ya hay candidatos exactos, no seguir
  }
  return [...map.values()].sort(
    (a, b) =>
      variants.indexOf(a.matched) - variants.indexOf(b.matched) || b.freq - a.freq || (a.channelId < b.channelId ? -1 : 1),
  )
}

async function findTopicChannel(name, usbList) {
  const variants = nameVariants(name)
  const cands = await collectCandidates(name, variants)
  if (!cands.length) return null
  // Puntúa con tu USB: gana el candidato con más temas en tu colección.
  // Así se descarta al homónimo (mismo nombre, otro grupo).
  let best = null
  for (const c of cands.slice(0, 4)) {
    const rss = await fetchChannelRSS(c.channelId)
    if (!rss.ok || !rss.feedTitle || !isTopicTitle(rss.feedTitle)) continue
    if (norm(stripTopic(rss.feedTitle)) !== c.matched) continue
    const s = overlapScore(
      rss.videos.map((v) => v.title),
      usbList,
    )
    const entry = { ...c, rss, score: s }
    if (!best || s.overlap > best.score.overlap) best = entry
  }
  return best
}

export default async function handler(req, res) {
  const raw = req.query?.name ?? new URL(req.url, 'http://x').searchParams.get('name') ?? ''
  const name = String(raw).trim()
  if (!name) return res.status(400).json({ error: 'Falta ?name=' })

  const artists = await loadArtists(process.cwd())
  const entry = artists.find((a) => norm(a.name) === norm(name)) ?? artists.find((a) => norm(a.normalized) === norm(name))
  const usbTitles = await loadUsbTitles(process.cwd())
  const overrides = await loadOverrides(process.cwd())
  const usbList = usbTitles[entry?.normalized ?? norm(name)] ?? []

  const displayName = entry?.name ?? name
  let channelId = entry?.channelId ?? overrides[entry?.normalized]?.channelId ?? null
  let channelTitle = entry ? `${entry.name} - Topic` : `${name} - Topic`
  let rss = null

  if (!channelId) {
    const found = await findTopicChannel(displayName, usbList)
    if (!found) {
      return res.status(404).json({
        name: displayName,
        temas: entry?.temas ?? 0,
        topic: null,
        message: 'Este artista no tiene canal oficial en YouTube Music (sin "- Topic"). Solo existen vídeos de terceros.',
      })
    }
    channelId = found.channelId
    channelTitle = found.channelTitle
    rss = found.rss
  }

  if (!rss) {
    rss = await fetchChannelRSS(channelId)
    if (!rss.ok) return res.status(502).json({ error: `RSS falló: ${rss.reason}` })
    // Verificación oficial: el feed debe ser "<Artista> - Topic/Tema" exacto
    // (o su variante con prefijo de formación). Si no, es de terceros y se rechaza.
    const allowed = new Set(nameVariants(displayName))
    if (!rss.feedTitle || !isTopicTitle(rss.feedTitle) || !allowed.has(norm(stripTopic(rss.feedTitle)))) {
      return res.status(404).json({
        name: displayName,
        temas: entry?.temas ?? 0,
        topic: null,
        message: `Sin canal oficial en YouTube Music (el canal encontrado "${rss.feedTitle ?? 'desconocido'}" no es el Topic oficial de ${displayName}).`,
      })
    }
  }

  // Cruce con tu USB para cazar homónimos (mismo nombre, otro grupo).
  const s = overlapScore(
    rss.videos.map((v) => v.title),
    usbList,
  )
  const suspect = s.usbTotal >= 3 && s.overlap === 0

  // 1) Lista OFICIAL de singles de YouTube Music (MPAD<channel>). 2) Fallback:
  // últimas subidas del Topic verificado (también oficiales, mismo canal).
  let latest = null
  let via = 'ytm-singles'
  try {
    latest = (await getLatestSingles(channelId, 2)).singles
  } catch {
    latest = null
  }
  if (!latest?.length) {
    via = 'rss'
    latest = rss.videos.slice(0, 2).map((v) => ({
      videoId: v.videoId,
      title: decode(v.title),
      year: v.publishedAt?.slice(0, 4) ?? null,
      publishedAt: v.publishedAt,
      urlMusic: `https://music.youtube.com/watch?v=${v.videoId}`,
      urlYoutube: `https://www.youtube.com/watch?v=${v.videoId}`,
      thumb: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
    }))
  }
  if (!latest.length) {
    return res.status(404).json({
      name: displayName,
      temas: entry?.temas ?? 0,
      topic: null,
      message: `El canal oficial de ${displayName} en YouTube Music no tiene singles publicados.`,
    })
  }

  return res.status(200).json({
    name: entry?.name ?? name,
    temas: entry?.temas ?? 0,
    channelId,
    channelTitle,
    source: 'youtube-music',
    via,
    match: { usbTotal: s.usbTotal, rssTotal: s.rssTotal, overlap: s.overlap, suspect },
    latest,
  })
}
