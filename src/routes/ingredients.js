import { Hono } from 'hono'
import { db, uid } from '../db.js'

const r = new Hono()

const COLUMNS = [
  'name', 'category', 'description', 'alcohol_content', 'image_url',
  'notes', 'systembolaget_number', 'systembolaget_url', 'has_at_home',
]

function pickFields(body) {
  const out = {}
  for (const key of COLUMNS) {
    if (key in body) out[key] = body[key]
  }
  if ('has_at_home' in out) out.has_at_home = out.has_at_home ? 1 : 0
  if ('alcohol_content' in out && out.alcohol_content === '') out.alcohol_content = null
  return out
}

function hydrate(row) {
  if (!row) return row
  return { ...row, has_at_home: !!row.has_at_home }
}

r.get('/', (c) => {
  const home = c.req.query('home')
  const sql = home === '1'
    ? 'SELECT * FROM ingredients WHERE has_at_home = 1 ORDER BY name'
    : 'SELECT * FROM ingredients ORDER BY name'
  return c.json(db.prepare(sql).all().map(hydrate))
})

r.get('/:id', (c) => {
  const row = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(c.req.param('id'))
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json(hydrate(row))
})

r.post('/', async (c) => {
  const body = await c.req.json()
  const fields = pickFields(body)
  const id = uid()
  const cols = ['id', ...Object.keys(fields)]
  const placeholders = cols.map(() => '?').join(', ')
  db.prepare(`INSERT INTO ingredients (${cols.join(', ')}) VALUES (${placeholders})`)
    .run(id, ...Object.values(fields))
  return c.json(hydrate(db.prepare('SELECT * FROM ingredients WHERE id = ?').get(id)), 201)
})

r.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const row = db.prepare('SELECT id FROM ingredients WHERE id = ?').get(id)
  if (!row) return c.json({ error: 'not found' }, 404)

  const fields = pickFields(await c.req.json())
  if (Object.keys(fields).length === 0) {
    return c.json(hydrate(db.prepare('SELECT * FROM ingredients WHERE id = ?').get(id)))
  }
  const setClause = Object.keys(fields).map(k => `${k} = ?`).join(', ')
  db.prepare(`UPDATE ingredients SET ${setClause} WHERE id = ?`)
    .run(...Object.values(fields), id)
  return c.json(hydrate(db.prepare('SELECT * FROM ingredients WHERE id = ?').get(id)))
})

r.patch('/:id/home-status', async (c) => {
  const id = c.req.param('id')
  const { has_at_home } = await c.req.json()
  const info = db.prepare('UPDATE ingredients SET has_at_home = ? WHERE id = ?')
    .run(has_at_home ? 1 : 0, id)
  if (info.changes === 0) return c.json({ error: 'not found' }, 404)
  return c.json(hydrate(db.prepare('SELECT * FROM ingredients WHERE id = ?').get(id)))
})

r.delete('/:id', (c) => {
  const info = db.prepare('DELETE FROM ingredients WHERE id = ?').run(c.req.param('id'))
  if (info.changes === 0) return c.json({ error: 'not found' }, 404)
  return c.body(null, 204)
})

export default r
