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

const stripTopic = (t) => t.replace(/- (topic|tema)$/i, '').trim()
const isTopicTitle = (t) => /- (topic|tema)$/i.test(norm(t))

async function fetchHtml(url, timeoutMs = 9000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

function pickTopic(cands, variants) {
  // SOLO match exacto contra variantes del nombre oficial
  // (nombre, "Orquesta X", "Grupo X"...): nada de terceros ni parecidos.
  // Devuelve también con qué variante casó, para verificar el RSS después.
  const freq = new Map()
  for (const p of cands) freq.set(p.id + '|' + p.text, (freq.get(p.id + '|' + p.text) ?? 0) + 1)
  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1])
  for (const v of variants) {
    const exact = ranked.find(([k]) => norm(stripTopic(k.split('|')[1])) === v)
    if (exact) {
      const [id, text] = exact[0].split('|')
      return { channelId: id, channelTitle: text, matched: v }
    }
  }
  return null
}

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

async function findTopicChannel(name) {
  const variants = nameVariants(name)
  // A) pestaña "Canales": devuelve channelRenderer con el nombre visible
  // (en español YouTube muestra "- Tema" en vez de "- Topic": es el mismo canal).
  {
    const html = await fetchHtml(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(name)}&sp=EgIQAg%253D%253D`,
    )
    if (html) {
      const pairs = [
        ...html.matchAll(/"channelRenderer":\{"channelId":"(UC[^"]+)","title":\{"simpleText":"([^"]+)"/g),
      ].map((m) => ({ id: m[1], text: m[2] }))
      const hit = pickTopic(
        pairs.filter((p) => isTopicTitle(p.text)),
        variants,
      )
      if (hit) return hit
    }
  }
  // B) fallback: dueños de los vídeos ("X - Topic / - Tema")
  for (const q of [`${name} - Topic`, `${name} Topic`, `${name} - Tema`, `Orquesta ${name}`]) {
    const html = await fetchHtml(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`)
    if (!html) continue
    const pairs = [
      ...html.matchAll(
        /"text":"([^"]{2,60}?)","navigationEndpoint":\{"clickTrackingParams".*?"browseId":"(UC[^"]+)"/g,
      ),
    ].map((m) => ({ text: m[1], id: m[2] }))
    const hit = pickTopic(
      pairs.filter((p) => isTopicTitle(p.text)),
      variants,
    )
    if (hit) return hit
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
  let matched = entry ? norm(entry.name) : norm(name)

  if (!channelId) {
    const found = await findTopicChannel(entry?.name ?? name)
    if (!found) {
      return res.status(404).json({
        name: entry?.name ?? name,
        temas: entry?.temas ?? 0,
        topic: null,
        message: 'Este artista no tiene canal oficial en YouTube Music (sin "- Topic"). Solo existen vídeos de terceros.',
      })
    }
    channelId = found.channelId
    channelTitle = found.channelTitle
    matched = found.matched
  }

  const rss = await fetchChannelRSS(channelId)
  if (!rss.ok) return res.status(502).json({ error: `RSS falló: ${rss.reason}` })

  // Verificación oficial: el feed debe ser "<Artista> - Topic/Tema" exacto
  // (o su variante con prefijo de formación). Si no, es de terceros y se rechaza.
  const allowed = new Set(nameVariants(entry?.name ?? name).concat([matched]))
  if (!rss.feedTitle || !isTopicTitle(rss.feedTitle) || !allowed.has(norm(stripTopic(rss.feedTitle)))) {
    return res.status(404).json({
      name: entry?.name ?? name,
      temas: entry?.temas ?? 0,
      topic: null,
      message: `Sin canal oficial en YouTube Music (el canal encontrado "${rss.feedTitle ?? 'desconocido'}" no es el Topic oficial de ${entry?.name ?? name}).`,
    })
  }

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
