import { useEffect, useMemo, useState } from 'react'
import QueuePlayer from './QueuePlayer.jsx'

const BOARD_KEY = 'ytm-board-v1'

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

function ageText(at) {
  if (!at) return ''
  const h = (Date.now() - at) / 3600000
  if (h < 1) return 'hace unos minutos'
  if (h < 24) return `hace ${Math.floor(h)} h`
  return `hace ${Math.floor(h / 24)} d`
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
  const [scope, setScope] = useState(50)
  const [single, setSingle] = useState(null) // { artist, data, syncing }
  const [playing, setPlaying] = useState(null)
  const [board, setBoard] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(BOARD_KEY) ?? '{}')
    } catch {
      return {}
    }
  })
  const [prog, setProg] = useState({ running: false, done: 0, total: 0 })
  const [queue, setQueue] = useState([])
  const [qi, setQi] = useState(0)

  useEffect(() => {
    fetch('/data/artists.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setArtists([...(Array.isArray(d) ? d : [])].sort((a, b) => b.temas - a.temas)))
      .catch(() => setArtists([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(BOARD_KEY, JSON.stringify(board))
    } catch {
      // caché llena: se sigue en memoria
    }
  }, [board])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return artists
    return artists.filter((a) => a.name.toLowerCase().includes(needle))
  }, [artists, q])

  async function fetchOne(a) {
    const r = await fetch(`/api/artist?name=${encodeURIComponent(a.name)}`)
    return r.json()
  }

  async function syncSingle(a) {
    setSingle({ artist: a, data: null, syncing: true })
    setPlaying(null)
    try {
      const data = await fetchOne(a)
      setSingle({ artist: a, data, syncing: false })
      setBoard((prev) => ({ ...prev, [a.normalized]: { data, at: Date.now() } }))
    } catch {
      setSingle({ artist: a, data: { error: 'Fallo de red' }, syncing: false })
    }
  }

  async function syncChart(force = false) {
    const targets = artists.slice(0, scope)
    const pending = force ? targets : targets.filter((a) => !board[a.normalized])
    if (!pending.length) return
    setProg({ running: true, done: 0, total: pending.length })
    await pool(pending, 4, async (a) => {
      try {
        const data = await fetchOne(a)
        setBoard((prev) => ({ ...prev, [a.normalized]: { data, at: Date.now() } }))
      } catch {
        setBoard((prev) => ({ ...prev, [a.normalized]: { data: { name: a.name, error: 'Fallo de red' }, at: Date.now() } }))
      }
      setProg((p) => ({ ...p, done: p.done + 1 }))
    })
    setProg((p) => ({ ...p, running: false }))
  }

  // Chart: artistas ordenados por FECHA de su último single (reciente → antiguo)
  const { chart, missing, syncedInScope } = useMemo(() => {
    const inScope = artists.slice(0, scope)
    const ok = []
    const missing = []
    let synced = 0
    for (const a of inScope) {
      const hit = board[a.normalized]
      if (!hit) continue
      synced++
      if (hit.data?.latest?.length) ok.push({ artist: a, data: hit.data, at: hit.at })
      else missing.push({ artist: a, data: hit.data })
    }
    ok.sort((x, y) => new Date(y.data.latest[0].publishedAt) - new Date(x.data.latest[0].publishedAt))
    return { chart: ok, missing, syncedInScope: synced }
  }, [artists, board, scope])

  function playAll() {
    if (!chart.length) return
    setQueue(chart.map(({ artist, data }) => ({ ...data.latest[0], artist: data.name, key: artist.normalized })))
    setQi(0)
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 bg-zinc-900/60 sticky top-0 backdrop-blur z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex-1">
            <h1 className="text-xl font-bold">Últimos singles 🎶</h1>
            <p className="text-sm text-zinc-400">
              {artists.length} formaciones · ordenadas por su último single en YouTube Music
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

      <main className={`max-w-5xl mx-auto px-4 py-6 space-y-6 ${queue.length ? 'pb-40' : ''}`}>
        <section className="rounded-2xl border border-emerald-900 bg-emerald-950/20 p-4">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <h2 className="font-semibold flex-1">Chart por último single ({chart.length}/{artists.slice(0, scope).length})</h2>
            <select
              value={scope}
              onChange={(e) => setScope(Number(e.target.value))}
              className="rounded-lg bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-sm"
              title="Alcance"
            >
              <option value={50}>Top 50</option>
              <option value={100}>Top 100</option>
              <option value={200}>Top 200</option>
              <option value={867}>Todos</option>
            </select>
            <button
              onClick={() => syncChart(false)}
              disabled={prog.running || loading}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold disabled:opacity-50"
            >
              Sincronizar
            </button>
            {syncedInScope > 0 && (
              <button
                onClick={() => syncChart(true)}
                disabled={prog.running}
                className="px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-sm disabled:opacity-50"
              >
                ↻ Actualizar
              </button>
            )}
            {chart.length > 0 && (
              <button
                onClick={playAll}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold"
              >
                ▶ Reproducir
              </button>
            )}
          </div>
          {prog.running && (
            <div className="mb-3">
              <p className="text-sm text-zinc-400 mb-1">Sincronizando {prog.done}/{prog.total}…</p>
              <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(prog.done / Math.max(prog.total, 1)) * 100}%` }} />
              </div>
            </div>
          )}
          {!prog.running && chart.length === 0 && (
            <p className="text-sm text-zinc-400">Elige alcance y dale a sincronizar: trae el último single de YouTube Music de cada formación y los ordena del más reciente al más antiguo.</p>
          )}
          {chart.length > 0 && (
            <ol className="space-y-2">
              {chart.map(({ artist, data, at }, i) => {
                const v = data.latest[0]
                const isCurrent = queue.length > 0 && queue[qi]?.videoId === v.videoId
                return (
                  <li key={artist.normalized} className={`rounded-xl overflow-hidden border bg-zinc-900 ${isCurrent ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-zinc-800'}`}>
                    <div className="flex gap-3 p-2">
                      <span className="w-8 text-right text-zinc-500 tabular-nums shrink-0 pt-1">{i + 1}</span>
                      <button onClick={() => setPlaying(playing === v.videoId ? null : v.videoId)} className="relative shrink-0">
                        <img src={v.thumb} alt="" className="w-28 aspect-video object-cover rounded-lg" loading="lazy" />
                        <span className="absolute inset-0 m-auto w-8 h-8 rounded-full bg-black/70 text-sm flex items-center justify-center">
                          {playing === v.videoId ? '⏸' : '▶'}
                        </span>
                      </button>
                      <div className="flex-1 text-sm min-w-0">
                        <p className="text-xs text-emerald-400 font-semibold">
                          {v.publishedAt?.slice(0, 10)} · {ageText(at)}
                        </p>
                        <p className="font-bold truncate">{v.title}</p>
                        <button onClick={() => syncSingle(artist)} className="text-zinc-400 truncate hover:text-emerald-300" title="Ver sus 2 últimas">
                          {data.name}
                        </button>
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
              <p className="text-amber-300 font-semibold mb-1">Sin canal oficial en YouTube Music ({missing.length}):</p>
              <p className="text-zinc-400">{missing.map((m) => m.artist.name).join(' · ')}</p>
            </div>
          )}
        </section>

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
                      <p className="text-xs text-emerald-400 font-semibold">{i === 0 ? 'ÚLTIMO SINGLE' : 'ANTERIOR'} · {v.publishedAt?.slice(0, 10)}</p>
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
            Formaciones ({loading ? '…' : filtered.length}) · por nº de canciones en tu USB
          </h2>
          <p className="text-xs text-zinc-500 mb-3">Clic en el nombre para ver sus 2 últimos singles</p>
          {loading ? (
            <p className="text-sm text-zinc-400">Cargando…</p>
          ) : (
            <ol className="divide-y divide-zinc-800">
              {filtered.map((a, i) => (
                <li key={a.normalized}>
                  <button onClick={() => syncSingle(a)} className="w-full flex items-center gap-3 px-2 py-2 text-left text-sm rounded-lg hover:bg-zinc-800/60 min-w-0">
                    <span className="w-10 text-right text-zinc-500 tabular-nums shrink-0">{i + 1}</span>
                    <span className="flex-1 truncate font-medium">{a.name}</span>
                    {board[a.normalized]?.data?.latest && (
                      <span className="text-[10px] text-zinc-500 shrink-0">{board[a.normalized].data.latest[0]?.publishedAt?.slice(0, 10)}</span>
                    )}
                    <span className="text-zinc-300 tabular-nums shrink-0">{a.temas} 🎵</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>

      {queue.length > 0 && (
        <QueuePlayer
          queue={queue}
          index={qi}
          onNext={() => setQi((i) => (i + 1) % queue.length)}
          onPrev={() => setQi((i) => (i - 1 + queue.length) % queue.length)}
          onSelect={setQi}
          onClose={() => setQueue([])}
        />
      )}
    </div>
  )
}
