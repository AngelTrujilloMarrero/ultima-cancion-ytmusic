// YouTube Music oficial vía InnerTube (misma API que usa music.youtube.com):
// artista (MPAD<channelId>) -> pestaña "Singles y EPs" -> singles ordenados
// (título, año) -> detalle del single -> videoId -> fecha exacta de subida.
const KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30'
const API = `https://music.youtube.com/youtubei/v1/browse?key=${KEY}&prettyPrint=false`
// Clave del cliente web de youtube.com (para buscar canales: JSON ligero).
const WEB_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'
const WEB_API = `https://www.youtube.com/youtubei/v1/search?key=${WEB_KEY}&prettyPrint=false`
const CH_PARAMS = 'EgIQAg==' // filtro: solo canales
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

async function ytmBrowse(payload, timeoutMs = 12000) {  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://music.youtube.com',
        Referer: 'https://music.youtube.com/',
        'User-Agent': UA,
      },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240619.00.00', hl: 'es', gl: 'ES' } },
        ...payload,
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`ytm http_${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(t)
  }
}

function findChipContinuation(node, startsWith) {
  if (Array.isArray(node)) {
    for (const v of node) {
      const r = findChipContinuation(v, startsWith)
      if (r) return r
    }
    return null
  }
  if (node && typeof node === 'object') {
    const c = node.chipCloudChipRenderer
    if (c) {
      const text = c.text?.runs?.[0]?.text ?? ''
      if (text.toLowerCase().startsWith(startsWith)) {
        return c.navigationEndpoint?.browseSectionListReloadEndpoint?.continuation ?? null
      }
    }
    for (const v of Object.values(node)) {
      const r = findChipContinuation(v, startsWith)
      if (r) return r
    }
  }
  return null
}

function parseSingles(node) {
  const out = []
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk)
    if (!o || typeof o !== 'object') return
    const r = o.musicTwoRowItemRenderer
    if (r) {
      const title = r.title?.runs?.[0]?.text
      const sub = (r.subtitle?.runs ?? []).map((x) => x.text).join('')
      const year = sub.match(/(19|20)\d{2}/)?.[0] ?? null
      const browseId = r.navigationEndpoint?.browseEndpoint?.browseId ?? null
      if (title && browseId && /single|ep/i.test(sub)) out.push({ title, year, browseId })
      return
    }
    Object.values(o).forEach(walk)
  }
  walk(node)
  return out
}

async function singleVideo(browseId) {
  const d = await ytmBrowse({ browseId })
  let hit = null
  const walk = (o) => {
    if (hit || Array.isArray(o)) {
      if (Array.isArray(o)) o.forEach(walk)
      return
    }
    if (!o || typeof o !== 'object') return
    const r = o.musicResponsiveListItemRenderer
    if (r?.playlistItemData?.videoId && !hit) {
      const col = r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text
      hit = { videoId: r.playlistItemData.videoId, trackTitle: col ?? null }
      return
    }
    Object.values(o).forEach(walk)
  }
  walk(d)
  if (!hit) throw new Error('single sin video')
  return hit
}

async function uploadDate(videoId, timeoutMs = 10000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'User-Agent': UA },
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    const html = await res.text()
    return html.match(/"uploadDate":"([^"]+)"/)?.[1] ?? null
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

// Búsqueda de CANALES vía InnerTube (JSON ligero ~100KB, sin scrapear HTML).
// Devuelve [{channelId, title}].
export async function searchChannels(query, timeoutMs = 10000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(WEB_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://www.youtube.com',
        'User-Agent': UA,
      },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion: '2.20240619.00.00', hl: 'es', gl: 'ES' } },
        query,
        params: CH_PARAMS,
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`search http_${res.status}`)
    const d = await res.json()
    const out = []
    const walk = (o) => {
      if (Array.isArray(o)) return o.forEach(walk)
      if (!o || typeof o !== 'object') return
      const c = o.channelRenderer
      if (c?.channelId) {
        const title = c.title?.simpleText ?? c.title?.runs?.[0]?.text ?? null
        if (title) out.push({ channelId: c.channelId, title })
        return
      }
      Object.values(o).forEach(walk)
    }
    walk(d)
    return out
  } finally {
    clearTimeout(t)
  }
}

// Devuelve los N últimos singles OFICIALES del canal (lista de YouTube Music).
export async function getLatestSingles(channelId, n = 2) {
  const artist = await ytmBrowse({ browseId: `MPAD${channelId}` })
  const rawCont = findChipContinuation(artist, 'single')
  const cont = typeof rawCont === 'string' ? rawCont : rawCont?.reloadContinuationData?.continuation
  if (!cont) throw new Error('sin pestaña de singles')
  const list = await ytmBrowse({ continuation: cont })
  const singles = parseSingles(list).slice(0, Math.max(n, 1))
  if (!singles.length) throw new Error('lista de singles vacía')
  const detailed = await Promise.all(
    singles.map(async (s) => {
      const v = await singleVideo(s.browseId)
      const date = await uploadDate(v.videoId)
      return {
        videoId: v.videoId,
        title: s.title,
        year: s.year,
        publishedAt: date ?? (s.year ? `${s.year}-01-01T00:00:00+00:00` : null),
        urlMusic: `https://music.youtube.com/watch?v=${v.videoId}`,
        urlYoutube: `https://www.youtube.com/watch?v=${v.videoId}`,
        thumb: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
      }
    }),
  )
  return { singles: detailed, total: parseSingles(list).length }
}
