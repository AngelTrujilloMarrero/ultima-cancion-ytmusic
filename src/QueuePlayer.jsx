import { useEffect, useRef, useState } from 'react'

let apiPromise = null
function loadApi() {
  if (apiPromise) return apiPromise
  apiPromise = new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT)
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve(window.YT)
    }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    document.body.appendChild(s)
  })
  return apiPromise
}

// Nota: YouTube Music no ofrece reproductor integrable (sin /embed).
// Esta barra es estilo música: carátula + controles, y suena el MISMO audio
// oficial (mismo ID que en music.youtube.com/watch?v=...). El botón 🎵 lo
// abre en YouTube Music para seguir allí.
export default function QueuePlayer({ queue, index, onNext, onPrev, onSelect, onClose }) {
  const divRef = useRef(null)
  const playerRef = useRef(null)
  const [playing, setPlaying] = useState(true)
  const nextRef = useRef(onNext)
  nextRef.current = onNext
  const track = queue[index]

  useEffect(() => {
    let dead = false
    loadApi().then((YT) => {
      if (dead || !divRef.current) return
      playerRef.current = new YT.Player(divRef.current, {
        width: '4',
        height: '4',
        videoId: queue[index]?.videoId,
        playerVars: { autoplay: 1, rel: 0 },
        events: {
          onReady: (e) => e.target.playVideo(),
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.ENDED) nextRef.current()
            else if (e.data === YT.PlayerState.PLAYING) setPlaying(true)
            else if (e.data === YT.PlayerState.PAUSED) setPlaying(false)
          },
        },
      })
    })
    return () => {
      dead = true
      playerRef.current?.destroy?.()
      playerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    playerRef.current?.loadVideoById?.(track.videoId)
    setPlaying(true)
  }, [track.videoId]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggle() {
    const p = playerRef.current
    if (!p?.getPlayerState) return
    if (p.getPlayerState() === 1) {
      p.pauseVideo()
      setPlaying(false)
    } else {
      p.playVideo()
      setPlaying(true)
    }
  }

  if (!track) return null

  return (
    <div className="fixed bottom-0 inset-x-0 z-20 border-t border-zinc-700 bg-zinc-900/95 backdrop-blur">
      {/* audio-only: el iframe queda invisible pero sonando */}
      <div ref={divRef} style={{ position: 'absolute', width: 2, height: 2, opacity: 0, pointerEvents: 'none' }} />
      <div className="max-w-5xl mx-auto px-3 py-2 flex items-center gap-3">
        <img
          src={track.thumb}
          alt=""
          className="w-14 h-14 rounded-lg object-cover shrink-0 shadow"
        />
        <div className="flex-1 min-w-0 text-sm">
          <p className="text-[11px] text-emerald-400 font-semibold">
            {index + 1}/{queue.length} · {track.publishedAt?.slice(0, 10)} · YouTube Music
          </p>
          <p className="font-bold truncate">{track.title}</p>
          <p className="text-zinc-400 truncate text-xs">{track.artist}</p>
          <input
            className="w-full mt-1 accent-emerald-500 h-1 cursor-pointer"
            type="range"
            min={0}
            max={queue.length - 1}
            value={index}
            onChange={(e) => onSelect(Number(e.target.value))}
            title="Saltar en la cola"
          />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onPrev} title="Anterior" className="w-9 h-9 rounded-full bg-zinc-700 hover:bg-zinc-600">⏮</button>
          <button onClick={toggle} title={playing ? 'Pausar' : 'Seguir'} className="w-11 h-11 rounded-full bg-emerald-600 hover:bg-emerald-500 text-lg">
            {playing ? '⏸' : '▶'}
          </button>
          <button onClick={onNext} title="Siguiente" className="w-9 h-9 rounded-full bg-zinc-700 hover:bg-zinc-600">⏭</button>
          <a title="Seguir en YouTube Music" target="_blank" rel="noreferrer" href={track.urlMusic} className="h-9 px-3 rounded-full bg-emerald-700 hover:bg-emerald-600 text-xs font-semibold flex items-center">🎵 YT Music</a>
          <button onClick={onClose} title="Cerrar reproductor" className="w-9 h-9 rounded-full text-zinc-400 hover:text-white">✕</button>
        </div>
      </div>
    </div>
  )
}
