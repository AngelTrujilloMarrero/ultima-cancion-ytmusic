import { useEffect, useMemo, useState } from 'react'

export default function App() {
  const [artists, setArtists] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [playing, setPlaying] = useState(null)

  useEffect(() => {
    fetch('/data/artists.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setArtists([...(Array.isArray(d) ? d : [])].sort((a, b) => b.temas - a.temas)))
      .catch(() => setArtists([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return artists
    return artists.filter((a) => a.name.toLowerCase().includes(needle))
  }, [artists, q])

  async function syncArtist(a) {
    setSelected(a)
    setDetail(null)
    setPlaying(null)
    setSyncing(true)
    try {
      const r = await fetch(`/api/artist?name=${encodeURIComponent(a.name)}`)
      setDetail(await r.json())
    } catch {
      setDetail({ error: 'Fallo de red' })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 bg-zinc-900/60 sticky top-0 backdrop-blur z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex-1">
            <h1 className="text-xl font-bold">Formaciones · de mayor a menor 🎶</h1>
            <p className="text-sm text-zinc-400">
              {artists.length} formaciones ordenadas por nº de canciones · pulsa una para sincronizar sus 2 últimas de YouTube Music
            </p>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar formación…"
            className="w-full sm:w-72 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {selected && (
          <section className="rounded-2xl border border-emerald-900 bg-emerald-950/20 p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold">
                {selected.name} <span className="text-xs text-zinc-400">({selected.temas} canciones en tu USB)</span>
              </h2>
              <button onClick={() => { setSelected(null); setDetail(null); setPlaying(null) }} className="text-xs text-zinc-400 hover:text-white px-2 py-1">✕</button>
            </div>
            {syncing && <p className="text-sm text-zinc-400">Sincronizando con YouTube Music…</p>}
            {!syncing && detail?.latest && (
              <div className="grid md:grid-cols-2 gap-3">
                {detail.latest.map((v, i) => (
                  <article key={v.videoId} className="rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900">
                    <button onClick={() => setPlaying(v.videoId)} className="block w-full text-left">
                      {playing === v.videoId ? (
                        <div className="aspect-video bg-black">
                          <iframe
                            className="w-full h-full"
                            src={`https://www.youtube.com/embed/${v.videoId}?autoplay=1`}
                            title={v.title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      ) : (
                        <div className="relative">
                          <img src={v.thumb} alt="" className="w-full aspect-video object-cover" loading="lazy" />
                          <span className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-black/70 text-2xl flex items-center justify-center">▶</span>
                        </div>
                      )}
                    </button>
                    <div className="p-3 text-sm space-y-1">
                      <p className="text-xs text-emerald-400 font-semibold">{i === 0 ? 'ÚLTIMA' : 'ANTERIOR'} · {v.publishedAt?.slice(0, 10)}</p>
                      <p className="font-bold">{v.title}</p>
                      <div className="flex gap-2 pt-1">
                        <a className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold" target="_blank" rel="noreferrer" href={v.urlMusic}>YouTube Music</a>
                        <a className="px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-xs" target="_blank" rel="noreferrer" href={v.urlYoutube}>YouTube</a>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {!syncing && detail && !detail.latest && (
              <p className="text-sm text-amber-300">{detail.message ?? detail.error ?? 'Sin resultados.'}</p>
            )}
          </section>
        )}

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="font-semibold mb-3">
            Ranking ({loading ? '…' : filtered.length}) · de mayor a menor nº de canciones
          </h2>
          {loading ? (
            <p className="text-sm text-zinc-400">Cargando…</p>
          ) : (
            <ol className="divide-y divide-zinc-800">
              {filtered.map((a, i) => (
                <li key={a.normalized}>
                  <button
                    onClick={() => syncArtist(a)}
                    className={`w-full flex items-center gap-3 px-2 py-2 text-left text-sm hover:bg-zinc-800/60 rounded-lg ${selected?.normalized === a.normalized ? 'bg-zinc-800/60' : ''}`}
                  >
                    <span className="w-10 text-right text-zinc-500 tabular-nums shrink-0">{i + 1}</span>
                    <span className="flex-1 truncate font-medium">{a.name}</span>
                    {a.channelId && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900 text-emerald-300 shrink-0">sync ✓</span>}
                    <span className="text-zinc-300 tabular-nums shrink-0">{a.temas} 🎵</span>
                    <span className="text-xs text-emerald-400 shrink-0">sincronizar →</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </div>
  )
}
