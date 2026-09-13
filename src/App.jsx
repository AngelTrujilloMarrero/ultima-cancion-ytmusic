import { useEffect, useMemo, useState } from 'react'

const SEL_KEY = 'ytm-selected-v1'

async function pool(items, n, fn) {
  let i = 0
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const a = items[i++]
      await fn(a)
    }
  })
  await Promise.all(workers)
}

function SongLinks({ v }) {
  return (
    <div className="flex gap-2 pt-1">
      <a className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold" target="_blank" rel="noreferrer" href={v.urlMusic}>YouTube Music</a>
      <a className="px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-xs" target="_blank" rel="noreferrer" href={v.urlYoutube}>YouTube</a>
    </div>
  )
}

export default function App() {
  const [artists, setArtists] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(SEL_KEY) ?? '[]'))
    } catch {
      return new Set()
    }
  })
  const [single, setSingle] = useState(null) // { artist, data, syncing }
  const [playing, setPlaying] = useState(null)
  const [board, setBoard] = useState({}) // normalized -> respuesta /api/artist
  const [prog, setProg] = useState({ running: false, done: 0, total: 0 })

  useEffect(() => {
    fetch('/data/artists.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setArtists([...(Array.isArray(d) ? d : [])].sort((a, b) => b.temas - a.temas)))
      .catch(() => setArtists([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    localStorage.setItem(SEL_KEY, JSON.stringify([...selected]))
  }, [selected])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return artists
    return artists.filter((a) => a.name.toLowerCase().includes(needle))
  }, [artists, q])

  function toggle(norm) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(norm)) next.delete(norm)
      else next.add(norm)
      return next
    })
  }

  async function fetchOne(a) {
    const r = await fetch(`/api/artist?name=${encodeURIComponent(a.name)}`)
    return r.json()
  }

  async function syncSingle(a) {
    setSingle({ artist: a, data: null, syncing: true })
    setPlaying(null)
    try {
      setSingle({ artist: a, data: await fetchOne(a), syncing: false })
    } catch {
      setSingle({ artist: a, data: { error: 'Fallo de red' }, syncing: false })
    }
  }

  async function syncBoard(force = false) {
    const targets = artists.filter((a) => selected.has(a.normalized))
    const pending = force ? targets : targets.filter((a) => !board[a.normalized])
    if (!pending.length) return
    setProg({ running: true, done: 0, total: pending.length })
    await pool(pending, 4, async (a) => {
      try {
        const data = await fetchOne(a)
        setBoard((prev) => ({ ...prev, [a.normalized]: data }))
      } catch {
        setBoard((prev) => ({ ...prev, [a.normalized]: { name: a.name, error: 'Fallo de red' } }))
      }
      setProg((p) => ({ ...p, done: p.done + 1 }))
    })
    setProg((p) => ({ ...p, running: false }))
  }

  const { ranked, missing } = useMemo(() => {
    const ok = []
    const missing = []
    for (const a of artists) {
      if (!selected.has(a.normalized)) continue
      const d = board[a.normalized]
      if (!d) continue
      if (d.latest?.length) ok.push({ artist: a, data: d })
      else missing.push({ artist: a, data: d })
    }
    ok.sort((x, y) => new Date(y.data.latest[0].publishedAt) - new Date(x.data.latest[0].publishedAt))
    return { ranked: ok, missing }
  }, [artists, selected, board])

  const syncedCount = useMemo(
    () => artists.filter((a) => selected.has(a.normalized) && board[a.normalized]).length,
    [artists, selected, board],
  )

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 bg-zinc-900/60 sticky top-0 backdrop-blur z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex-1">
            <h1 className="text-xl font-bold">Formaciones · de mayor a menor 🎶</h1>
            <p className="text-sm text-zinc-400">
              {artists.length} formaciones · marca con ☑ tus favoritas y pulsa sincronizar
              {selected.size > 0 && <> · <span className="text-emerald-400 font-semibold">{selected.size} elegidas</span></>}
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
        {selected.size > 0 && (
          <section className="rounded-2xl border border-emerald-900 bg-emerald-950/20 p-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <h2 className="font-semibold flex-1">Mi selección ({selected.size}) → de lo más reciente a lo más antiguo</h2>
              <button
                onClick={() => syncBoard(false)}
                disabled={prog.running}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold disabled:opacity-50"
              >
                {syncedCount ? 'Sincronizar pendientes' : 'Sincronizar selección'}
              </button>
              {syncedCount > 0 && (
                <button
                  onClick={() => syncBoard(true)}
                  disabled={prog.running}
                  className="px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-sm disabled:opacity-50"
                >
                  ↻ Actualizar todo
                </button>
              )}
              <button onClick={() => setSelected(new Set())} className="px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-white">
                Limpiar
              </button>
            </div>
            {prog.running && <p className="text-sm text-zinc-400 mb-2">Sincronizando {prog.done}/{prog.total}…</p>}
            {!prog.running && syncedCount === 0 && <p className="text-sm text-zinc-400">Dale a sincronizar para traer lo último de YouTube Music de tus elegidas.</p>}
            {ranked.length > 0 && (
              <ol className="space-y-2">
                {ranked.map(({ artist, data }, i) => {
                  const v = data.latest[0]
                  return (
                    <li key={artist.normalized} className="rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900">
                      <div className="flex gap-3 p-2">
                        <span className="w-8 text-right text-zinc-500 tabular-nums shrink-0 pt-1">{i + 1}</span>
                        <button onClick={() => setPlaying(playing === v.videoId ? null : v.videoId)} className="relative shrink-0">
                          <img src={v.thumb} alt="" className="w-28 aspect-video object-cover rounded-lg" loading="lazy" />
                          <span className="absolute inset-0 m-auto w-8 h-8 rounded-full bg-black/70 text-sm flex items-center justify-center">
                            {playing === v.videoId ? '⏸' : '▶'}
                          </span>
                        </button>
                        <div className="flex-1 text-sm min-w-0">
                          <p className="text-xs text-emerald-400 font-semibold">{v.publishedAt?.slice(0, 10)}</p>
                          <p className="font-bold truncate">{v.title}</p>
                          <p className="text-zinc-400 truncate">{data.name}</p>
                          <SongLinks v={v} />
                        </div>
                      </div>
                      {playing === v.videoId && (
                        <div className="aspect-video bg-black">
                          <iframe
                            className="w-full h-full"
                            src={`https://www.youtube.com/embed/${v.videoId}?autoplay=1`}
                            title={v.title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
            {missing.length > 0 && (
              <div className="mt-3 text-sm">
                <p className="text-amber-300 font-semibold mb-1">Sin música en YouTube Music ({missing.length}):</p>
                <p className="text-zinc-400">{missing.map((m) => m.artist.name).join(' · ')}</p>
              </div>
            )}
          </section>
        )}

        {single && (
          <section className="rounded-2xl border border-zinc-700 bg-zinc-900 p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold">
                {single.artist.name} <span className="text-xs text-zinc-400">({single.artist.temas} en tu USB)</span>
              </h2>
              <button onClick={() => { setSingle(null); setPlaying(null) }} className="text-xs text-zinc-400 hover:text-white px-2 py-1">✕</button>
            </div>
            {single.syncing && <p className="text-sm text-zinc-400">Sincronizando con YouTube Music…</p>}
            {!single.syncing && single.data?.latest && (
              <div className="grid md:grid-cols-2 gap-3">
                {single.data.latest.map((v, i) => (
                  <article key={v.videoId} className="rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950">
                    <button onClick={() => setPlaying(playing === v.videoId ? null : v.videoId)} className="block w-full text-left">
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
                      <SongLinks v={v} />
                    </div>
                  </article>
                ))}
              </div>
            )}
            {!single.syncing && single.data && !single.data.latest && (
              <p className="text-sm text-amber-300">{single.data.message ?? single.data.error ?? 'Sin resultados.'}</p>
            )}
          </section>
        )}

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="font-semibold mb-1">
            Ranking ({loading ? '…' : filtered.length}) · de mayor a menor nº de canciones
          </h2>
          <p className="text-xs text-zinc-500 mb-3">☑ marca tus favoritas · clic en el nombre para ver sus 2 últimas</p>
          {loading ? (
            <p className="text-sm text-zinc-400">Cargando…</p>
          ) : (
            <ol className="divide-y divide-zinc-800">
              {filtered.map((a, i) => (
                <li key={a.normalized} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-800/60">
                  <input
                    type="checkbox"
                    checked={selected.has(a.normalized)}
                    onChange={() => toggle(a.normalized)}
                    title={`Elegir ${a.name}`}
                    className="w-4 h-4 accent-emerald-500 shrink-0 cursor-pointer"
                  />
                  <button onClick={() => syncSingle(a)} className="flex flex-1 items-center gap-3 text-left text-sm min-w-0">
                    <span className="w-10 text-right text-zinc-500 tabular-nums shrink-0">{i + 1}</span>
                    <span className="flex-1 truncate font-medium">{a.name}</span>
                    {a.channelId && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900 text-emerald-300 shrink-0">sync ✓</span>}
                    {board[a.normalized]?.latest && <span className="text-[10px] text-zinc-500 shrink-0">{board[a.normalized].latest[0]?.publishedAt?.slice(0, 10)}</span>}
                    <span className="text-zinc-300 tabular-nums shrink-0">{a.temas} 🎵</span>
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
