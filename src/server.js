import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serveStatic } from '@hono/node-server/serve-static'
import { serve } from '@hono/node-server'
import { applySchema } from './db.js'
import drinks from './routes/drinks.js'
import ingredients from './routes/ingredients.js'
import upload from './routes/upload.js'

applySchema()

const app = new Hono()

app.use('*', logger())
app.use('*', cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: false,
}))

app.get('/health', (c) => c.json({ ok: true }))

app.route('/api/drinks', drinks)
app.route('/api/ingredients', ingredients)
app.route('/api/upload', upload)

app.use('/uploads/*', serveStatic({
  root: process.env.UPLOAD_DIR_ROOT || './data',
}))

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: err.message }, err.status || 500)
})

const port = Number(process.env.PORT || 3000)
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`drinkar-backend listening on http://localhost:${info.port}`)
})
