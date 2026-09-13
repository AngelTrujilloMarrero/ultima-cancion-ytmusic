# Último de tus formaciones 🎶

Playlist virtual siempre actualizada con lo último de **867 formaciones** del USB (`RED-SSD/MUSICA`, 3455 mp3). Lo último aparece lo primero.

## Ficheros estáticos generados del USB
- `data/artists.json` + `public/data/artists.json` — 867 formaciones `{ name, normalized, temas, channelId, status, variants }`
- `data/formaciones.json` + `public/data/formaciones.json` — array simple de nombres
- `data/formaciones.txt` — un nombre por línea
- `data/review-variantes.csv` — 99 grupos con variantes solo mayúsculas/acentos (ej. Armonía/Armonia Show)

Reglas aplicadas: fusión solo mayúsculas/acentos/espacios. `feat`/`&` se mantienen separados. `Acorde ≠ Acordes`.

Regenerar: `USB_PATH=/Volumes/RED-SSD/MUSICA node scripts/normalize.mjs`

## Dev
```
npm install
npm run dev
```

## Sync (Vercel Cron cada 2 días)
`vercel.json` → `GET /api/sync` con `0 5 */2 * *`. Lee `data/artists.json`, pide RSS por canal (0 cuota YouTube), ordena por `publishedAt desc`. `GET /api/playlist` sirve la playlist.

Pendiente: resolver `channelId` de las 867 (vía `@handle` + fallback API) y persistir `playlist.json` en Vercel Blob.
