// Sirve la última playlist sincronizada. Fase 1: proxy al último sync en memoria.
// Fase 2: leer desde Vercel Blob/KV donde /api/sync haya persistido playlist.json.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
  return res.status(200).json({
    updatedAt: null,
    items: [],
    note: 'Sin sync todavía. Resuelve channelId en data/artists.json y espera al cron cada 2 días.',
  })
}
