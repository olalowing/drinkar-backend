import { Hono } from 'hono'
import { db, uid } from '../db.js'

const r = new Hono()

const DRINK_COLUMNS = [
  'name', 'description', 'rating', 'glass_type', 'serving_type', 'garnish',
  'youtube_url', 'spritbas', 'tagline', 'emoji', 'taste_profile',
  'style_description', 'proportions_description', 'history_intro',
  'history_theory_1', 'history_theory_2', 'history_conclusion',
  'iba_classification', 'serving_occasion', 'difficulty_level',
  'prep_time_minutes', 'special_equipment', 'temperature', 'ice_type',
  'food_pairing',
]

function normalizeRating(value) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1 || n > 5) return null
  return Math.round(n)
}

function pickDrinkFields(body) {
  const out = {}
  for (const key of DRINK_COLUMNS) {
    if (key in body) out[key] = body[key]
  }
  if ('rating' in out) out.rating = normalizeRating(out.rating)
  return out
}

function sortedBy(rows, key = 'sort_order') {
  return [...rows].sort((a, b) => (a[key] ?? 0) - (b[key] ?? 0))
}

const stmts = {
  allDrinks: db.prepare('SELECT * FROM drinks ORDER BY created_at DESC'),
  drink: db.prepare('SELECT * FROM drinks WHERE id = ?'),
  images: db.prepare('SELECT id, image_url, sort_order FROM drink_images WHERE drink_id = ? ORDER BY sort_order'),
  ingredients: db.prepare('SELECT id, ingredient_name, amount, sort_order FROM drink_ingredients WHERE drink_id = ? ORDER BY sort_order'),
  instructions: db.prepare('SELECT instruction FROM drink_instructions WHERE drink_id = ? ORDER BY sort_order'),
  tags: db.prepare(`
    SELECT t.id, t.name
    FROM tags t
    JOIN drink_tags dt ON dt.tag_id = t.id
    WHERE dt.drink_id = ?
    ORDER BY t.name
  `),
  occasions: db.prepare(`
    SELECT ot.id, ot.name, ot.icon
    FROM occasion_tags ot
    JOIN drink_occasions doc ON doc.occasion_tag_id = ot.id
    WHERE doc.drink_id = ?
    ORDER BY ot.name
  `),
  variations: db.prepare('SELECT id, name, description, effect, sort_order FROM drink_variations WHERE drink_id = ? ORDER BY sort_order'),
  garnishOptions: db.prepare('SELECT id, name, description, effect, sort_order FROM garnish_options WHERE drink_id = ? ORDER BY sort_order'),
  proportions: db.prepare('SELECT id, name, description, sort_order FROM proportion_examples WHERE drink_id = ? ORDER BY sort_order'),
  tips: db.prepare('SELECT tip FROM drink_tips WHERE drink_id = ? ORDER BY sort_order'),
}

function hydrateList(drink) {
  return {
    ...drink,
    images: sortedBy(stmts.images.all(drink.id)).map(i => i.image_url),
    ingredients: stmts.ingredients.all(drink.id),
    instructions: stmts.instructions.all(drink.id).map(i => i.instruction),
    tags: stmts.tags.all(drink.id).map(t => t.name),
    occasion_tags: stmts.occasions.all(drink.id),
  }
}

function hydrateDetail(drink) {
  return {
    ...hydrateList(drink),
    variations: stmts.variations.all(drink.id),
    garnish_options: stmts.garnishOptions.all(drink.id),
    proportion_examples: stmts.proportions.all(drink.id),
    tips: stmts.tips.all(drink.id).map(t => t.tip),
  }
}

r.get('/', (c) => {
  return c.json(stmts.allDrinks.all().map(hydrateList))
})

r.get('/:id', (c) => {
  const drink = stmts.drink.get(c.req.param('id'))
  if (!drink) return c.json({ error: 'not found' }, 404)
  return c.json(hydrateDetail(drink))
})

function upsertTagByName(name) {
  const trimmed = name.trim()
  if (!trimmed) return null
  const existing = db.prepare('SELECT id FROM tags WHERE name = ?').get(trimmed)
  if (existing) return existing.id
  const id = uid()
  db.prepare('INSERT INTO tags (id, name) VALUES (?, ?)').run(id, trimmed)
  return id
}

function replaceChildren(drinkId, payload) {
  const {
    ingredients = [], instructions = [], images = [],
    tags = [], occasion_tags = [],
    variations = [], garnish_options = [], proportion_examples = [], tips = [],
    existingImages,
  } = payload

  if (Array.isArray(ingredients)) {
    db.prepare('DELETE FROM drink_ingredients WHERE drink_id = ?').run(drinkId)
    const ins = db.prepare('INSERT INTO drink_ingredients (id, drink_id, ingredient_name, amount, sort_order) VALUES (?, ?, ?, ?, ?)')
    ingredients.forEach((ing, idx) => ins.run(uid(), drinkId, ing.name ?? ing.ingredient_name, ing.amount, idx))
  }

  if (Array.isArray(instructions)) {
    db.prepare('DELETE FROM drink_instructions WHERE drink_id = ?').run(drinkId)
    const ins = db.prepare('INSERT INTO drink_instructions (id, drink_id, instruction, sort_order) VALUES (?, ?, ?, ?)')
    instructions.forEach((text, idx) => ins.run(uid(), drinkId, text, idx))
  }

  if (existingImages !== undefined || images.length > 0) {
    const keep = new Set(existingImages || [])
    db.prepare('DELETE FROM drink_images WHERE drink_id = ? AND image_url NOT IN (SELECT value FROM json_each(?))').run(
      drinkId, JSON.stringify([...keep]),
    )
    const ins = db.prepare('INSERT INTO drink_images (id, drink_id, image_url, sort_order) VALUES (?, ?, ?, ?)')
    const start = db.prepare('SELECT COUNT(*) AS n FROM drink_images WHERE drink_id = ?').get(drinkId).n
    images.forEach((url, idx) => ins.run(uid(), drinkId, url, start + idx))
  }

  if (Array.isArray(tags)) {
    db.prepare('DELETE FROM drink_tags WHERE drink_id = ?').run(drinkId)
    const link = db.prepare('INSERT OR IGNORE INTO drink_tags (drink_id, tag_id) VALUES (?, ?)')
    for (const name of tags) {
      const id = upsertTagByName(name)
      if (id) link.run(drinkId, id)
    }
  }

  if (Array.isArray(occasion_tags)) {
    db.prepare('DELETE FROM drink_occasions WHERE drink_id = ?').run(drinkId)
    const link = db.prepare('INSERT OR IGNORE INTO drink_occasions (drink_id, occasion_tag_id) VALUES (?, ?)')
    for (const tag of occasion_tags) {
      const id = typeof tag === 'string' ? tag : tag.id
      if (id) link.run(drinkId, id)
    }
  }

  if (Array.isArray(variations)) {
    db.prepare('DELETE FROM drink_variations WHERE drink_id = ?').run(drinkId)
    const ins = db.prepare('INSERT INTO drink_variations (id, drink_id, name, description, effect, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    variations.forEach((v, idx) => ins.run(uid(), drinkId, v.name, v.description, v.effect, idx))
  }

  if (Array.isArray(garnish_options)) {
    db.prepare('DELETE FROM garnish_options WHERE drink_id = ?').run(drinkId)
    const ins = db.prepare('INSERT INTO garnish_options (id, drink_id, name, description, effect, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    garnish_options.forEach((g, idx) => ins.run(uid(), drinkId, g.name, g.description, g.effect, idx))
  }

  if (Array.isArray(proportion_examples)) {
    db.prepare('DELETE FROM proportion_examples WHERE drink_id = ?').run(drinkId)
    const ins = db.prepare('INSERT INTO proportion_examples (id, drink_id, name, description, sort_order) VALUES (?, ?, ?, ?, ?)')
    proportion_examples.forEach((p, idx) => ins.run(uid(), drinkId, p.name, p.description ?? '', idx))
  }

  if (Array.isArray(tips)) {
    db.prepare('DELETE FROM drink_tips WHERE drink_id = ?').run(drinkId)
    const ins = db.prepare('INSERT INTO drink_tips (id, drink_id, tip, sort_order) VALUES (?, ?, ?, ?)')
    tips.forEach((t, idx) => ins.run(uid(), drinkId, t, idx))
  }
}

r.post('/', async (c) => {
  const body = await c.req.json()
  const fields = pickDrinkFields(body)
  const id = uid()

  const insert = db.transaction(() => {
    const cols = ['id', ...Object.keys(fields)]
    const placeholders = cols.map(() => '?').join(', ')
    db.prepare(`INSERT INTO drinks (${cols.join(', ')}) VALUES (${placeholders})`)
      .run(id, ...Object.values(fields))
    replaceChildren(id, body)
  })
  insert()

  return c.json(hydrateDetail(stmts.drink.get(id)), 201)
})

r.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const drink = stmts.drink.get(id)
  if (!drink) return c.json({ error: 'not found' }, 404)

  const body = await c.req.json()
  const fields = pickDrinkFields(body)

  const update = db.transaction(() => {
    if (Object.keys(fields).length > 0) {
      const setClause = Object.keys(fields).map(k => `${k} = ?`).join(', ')
      db.prepare(`UPDATE drinks SET ${setClause} WHERE id = ?`)
        .run(...Object.values(fields), id)
    }
    replaceChildren(id, body)
  })
  update()

  return c.json(hydrateDetail(stmts.drink.get(id)))
})

r.delete('/:id', (c) => {
  const id = c.req.param('id')
  const info = db.prepare('DELETE FROM drinks WHERE id = ?').run(id)
  if (info.changes === 0) return c.json({ error: 'not found' }, 404)
  return c.body(null, 204)
})

r.get('/_/tags', (c) => {
  return c.json(db.prepare('SELECT * FROM tags ORDER BY name').all())
})

r.get('/_/occasion-tags', (c) => {
  return c.json(db.prepare('SELECT * FROM occasion_tags ORDER BY name').all())
})

export default r
