import { useEffect, useMemo, useState } from 'react'

function useArtists() {
  const [artists, setArtists] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    fetch('/data/artists.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setArtists(Array.isArray(d) ? d : []))
      .catch(() => setArtists([]))
      .finally(() => setLoading(false))
  }, [])
  return { artists, loading }
}

function usePlaylist() {
  const [playlist, setPlaylist] = useState(null)
  useEffect(() => {
    fetch('/api/playlist')
      .then((r) => (r.ok ? r.json() : null))
      .then(setPlaylist)
      .catch(() => setPlaylist(null))
  }, [])
  return playlist
}

export default function App() {
  const { artists, loading } = useArtists()
  const playlist = usePlaylist()
  const [q, setQ] = useState('')
  const [current, setCurrent] = useState(null)

  const filtered = useMemo(() => {
    const needle = q.trim.toLowerCase()
    if (!needle) return artists.slice(0, 100)
    return artists.filter((a) => a.name.toLowerCase().includes(needle)).slice(0, 200)
  }, [artists, q])

  const items = playlist?.items ?? []

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 bg-zinc-900/60 sticky top-0 backdrop-blur z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex-1">
            <h1 className="text-xl font-bold">Último de tus formaciones 🎶</h1>
            <p className="text-sm text-zinc-400">
              {artists.length} formaciones · playlist virtual ordenada · lo último primero · sync cada 2 días
            </p>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar artista… ej. Acapulco, Tropin"
            className="w-full sm:w-72 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="font-semibold mb-1">Reproductor</h2>
          {current ? (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="aspect-video rounded-xl overflow-hidden bg-black">
                <iframe
                  className="w-full h-full"
                  src={`https://www.youtube.com/embed/${current.videoId}?autoplay=1`}
                  title={current.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <div className="text-sm space-y-2">
                <p className="font-bold text-base">{current.title}</p>
                <p className="text-zinc-400">{current.artist} · {current.publishedAt?.slice(0, 10)}</p>
                <div className="flex gap-2 pt-2">
                  <a className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm" target="_blank" rel="noreferrer" href={`https://www.youtube.com/watch?v=${current.videoId}`}>YouTube</a>
                  <a className="px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-sm" target="_blank" rel="noreferrer" href={`https://music.youtube.com/watch?v=${current.videoId}`}>YouTube Music</a>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-400">
              {items.length > 0
                ? 'Elige un tema de la playlist. Empieza por el primero: es lo más reciente.'
                : 'Aún no hay sync. Cuando el cron de Vercel corra cada 2 días verás aquí lo último de tus 867 formaciones. Mientras tanto puedes explorar el listado.'}
            </p>
          )}
        </section>

        {items.length > 0 && (
          <section className="rounded-2xl border border-emerald-900 bg-emerald-950/30 p-4">
            <h2 className="font-semibold mb-2">Playlist global · lo último primero ({items.length})</h2>
            <p className="text-xs text-zinc-400 mb-3">Actualizada: {playlist.updatedAt ?? '—'}</p>
            <ol className="divide-y divide-zinc-800">
              {items.slice(0, 100).map((v) => (
                <li key={v.videoId} className="py-2 flex items-center gap-3">
                  <button onClick={() => setCurrent(v)} className="text-left flex-1 hover:text-emerald-300 text-sm">
                    <span className="font-medium">{v.title}</span>
                    <span className="block text-xs text-zinc-400">{v.artist} · {v.publishedAt?.slice(0, 10)}</span>
                  </button>
                  <a className="text-xs px-2 py-1 rounded bg-zinc-800" target="_blank" rel="noreferrer" href={`https://music.youtube.com/watch?v=${v.videoId}`}>Music</a>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="font-semibold mb-2">
            Formaciones ({loading ? '…' : artists.length}) {q && `· filtro: ${filtered.length}`}
          </h2>
          {loading ? (
            <p className="text-sm text-zinc-400">Cargando…</p>
          ) : (
            <ul className="grid sm:grid-cols-2 md:grid-cols-3 gap-2 text-sm">
              {filtered.map((a) => (
                <li key={a.normalized} className="rounded-lg bg-zinc-800/60 border border-zinc-800 px-3 py-2 flex justify-between gap-2">
                  <span className="truncate">{a.name}</span>
                  <span className="text-zinc-400 shrink-0">{a.temas} 🎵</span>
                </li>
              ))}
            </ul>
          )}
          {!loading && !q && artists.length > 100 && (
            <p className="text-xs text-zinc-500 mt-3">Mostrando 100 de {artists.length}. Usa el buscador para filtrar.</p>
          )}
        </section>
      </main>
    </div>
  )
}
