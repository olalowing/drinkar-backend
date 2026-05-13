import { db, applySchema } from '../src/db.js'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const UPLOAD_DIR = process.env.UPLOAD_DIR
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '')

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL / VITE_SUPABASE_URL or anon key in env')
  process.exit(1)
}
if (!UPLOAD_DIR || !PUBLIC_URL) {
  console.error('Missing UPLOAD_DIR or PUBLIC_URL — load backend/.env')
  process.exit(1)
}

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

const BOOLEAN_COLS = {
  ingredients: ['has_at_home'],
}

function coerceRow(table, row) {
  const out = { ...row }
  for (const col of (BOOLEAN_COLS[table] || [])) {
    if (col in out) out[col] = out[col] ? 1 : 0
  }
  return out
}

async function selectAll(table) {
  const acc = []
  const pageSize = 1000
  let from = 0
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
      headers: {
        ...headers,
        Range: `${from}-${from + pageSize - 1}`,
        'Range-Unit': 'items',
        Prefer: 'count=exact',
      },
    })
    if (!res.ok) {
      const body = await res.text()
      const err = new Error(`select ${table}: ${res.status} ${body}`)
      err.status = res.status
      throw err
    }
    const items = await res.json()
    acc.push(...items)
    if (items.length < pageSize) break
    from += pageSize
  }
  return acc
}

function destColumns(table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name))
}

async function migrateTable(table) {
  let rows
  try {
    rows = await selectAll(table)
  } catch (err) {
    if (err.status === 404 || /does not exist/i.test(err.message)) {
      console.warn(`  skip ${table}: not in source`)
      return
    }
    throw err
  }
  if (!rows.length) {
    console.log(`  ${table}: 0 rows`)
    return
  }
  const known = destColumns(table)
  const transformed = rows.map(r => coerceRow(table, r))
  const allCols = Object.keys(transformed[0])
  const cols = allCols.filter(c => known.has(c))
  const dropped = allCols.filter(c => !known.has(c))
  const placeholders = cols.map(() => '?').join(', ')
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`
  )
  const tx = db.transaction((items) => {
    for (const r of items) stmt.run(...cols.map(c => r[c]))
  })
  tx(transformed)
  const note = dropped.length ? `  (dropped: ${dropped.join(', ')})` : ''
  console.log(`  ${table}: ${rows.length} rows${note}`)
}

async function listBucket(bucket) {
  const acc = []
  async function walk(prefix) {
    let offset = 0
    const limit = 1000
    while (true) {
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prefix,
          limit,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        }),
      })
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`list ${bucket}/${prefix}: ${res.status} ${body}`)
      }
      const items = await res.json()
      if (!items.length) break
      for (const item of items) {
        const full = prefix ? `${prefix}/${item.name}` : item.name
        if (item.id === null) await walk(full)
        else acc.push(full)
      }
      if (items.length < limit) break
      offset += limit
    }
  }
  await walk('')
  return acc
}

async function downloadFile(bucket, path) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`)
  if (!res.ok) throw new Error(`download ${bucket}/${path}: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function migrateBucket(bucket, destSubdir) {
  let paths
  try {
    paths = await listBucket(bucket)
  } catch (err) {
    console.warn(`  skip bucket ${bucket}: ${err.message}`)
    return
  }
  let downloaded = 0
  let skipped = 0
  for (const path of paths) {
    const dest = resolve(UPLOAD_DIR, destSubdir, path)
    if (existsSync(dest)) { skipped++; continue }
    try {
      const buf = await downloadFile(bucket, path)
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, buf)
      downloaded++
    } catch (err) {
      console.warn(`    skip ${path}: ${err.message}`)
    }
  }
  console.log(`  ${bucket}: ${downloaded} new, ${skipped} already present (${paths.length} total)`)
}

function rewriteImageUrls() {
  const mappings = [
    {
      from: `${SUPABASE_URL}/storage/v1/object/public/drink-images`,
      to: `${PUBLIC_URL}/uploads/drinks`,
    },
    {
      from: `${SUPABASE_URL}/storage/v1/object/public/ingredient-images`,
      to: `${PUBLIC_URL}/uploads/ingredients`,
    },
  ]
  for (const { from, to } of mappings) {
    const r1 = db.prepare(
      `UPDATE drink_images SET image_url = REPLACE(image_url, ?, ?) WHERE image_url LIKE ?`
    ).run(from, to, `${from}%`)
    const r2 = db.prepare(
      `UPDATE ingredients SET image_url = REPLACE(image_url, ?, ?) WHERE image_url LIKE ?`
    ).run(from, to, `${from}%`)
    console.log(`  ${from.split('/').pop()} → uploads/${to.split('/').pop()}: drink_images=${r1.changes}, ingredients=${r2.changes}`)
  }
}

async function main() {
  console.log(`source: ${SUPABASE_URL}`)
  console.log(`target db: ${process.env.DB_PATH}`)
  console.log(`target uploads: ${UPLOAD_DIR}`)
  console.log()

  applySchema()

  console.log('--- tables ---')
  const order = [
    'drinks',
    'ingredients',
    'tags',
    'occasion_tags',
    'drink_images',
    'drink_ingredients',
    'drink_instructions',
    'drink_variations',
    'drink_tips',
    'garnish_options',
    'proportion_examples',
    'drink_tags',
    'drink_occasions',
  ]
  for (const t of order) await migrateTable(t)

  console.log('--- storage ---')
  await migrateBucket('drink-images', 'drinks')
  await migrateBucket('ingredient-images', 'ingredients')

  console.log('--- rewrite urls ---')
  rewriteImageUrls()

  console.log('\ndone')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
