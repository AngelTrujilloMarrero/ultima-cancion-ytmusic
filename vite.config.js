import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// En `npm run dev` servimos las Vercel Functions /api/* en local
// con el mismo código (api/*.js), para no depender de `vercel dev`.
function localApi() {
  return {
    name: 'local-api',
    async configureServer(server) {
      const wrap = (path) => async (req, res, next) => {
        try {
          const mod = await server.ssrLoadModule(`./api/${path}.js`)
          const u = new URL(req.url, 'http://localhost')
          await mod.default(
            {
              query: Object.fromEntries(u.searchParams),
              url: req.url,
              headers: req.headers,
              method: req.method,
            },
            {
              status(code) {
                res.statusCode = code
                return this
              },
              json(body) {
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify(body))
              },
              setHeader: (k, v) => res.setHeader(k, v),
            },
          )
        } catch (err) {
          next(err)
        }
      }
      server.middlewares.use('/api/artist', wrap('artist'))
      server.middlewares.use('/api/playlist', wrap('playlist'))
      server.middlewares.use('/api/sync', wrap('sync'))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localApi()],
})
