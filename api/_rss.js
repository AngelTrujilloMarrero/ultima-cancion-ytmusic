import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const UA = 'ultima-cancion-ytmusic/1.0'

export async function fetchChannelRSS(channelId, timeoutMs = 4000) {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal })
    if (!res.ok) return { ok: false, reason: `http_${res.status}` }
    const xml = await res.text()
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1])
    const videos = entries
      .map((e) => {
        const id = e.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1]
        const title = e.match(/<title>(.*?)<\/title>/)?.[1]
        const published = e.match(/<published>(.*?)<\/published>/)?.[1]
        return id ? { videoId: id, title, publishedAt: published } : null
      })
      .filter(Boolean)
      .slice(0, 15)
    return { ok: true, videos }
  } catch (err) {
    return { ok: false, reason: err?.name === 'AbortError' ? 'timeout' : 'network' }
  } finally {
    clearTimeout(t)
  }
}

export async function loadArtists(rootDir) {
  const raw = await readFile(join(rootDir, 'data', 'artists.json'), 'utf8')
  return JSON.parse(raw)
}
