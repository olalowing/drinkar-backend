import { Hono } from 'hono'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, extname } from 'node:path'
import { uid } from '../db.js'

const r = new Hono()

const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || './data/uploads')
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000'
const MAX_BYTES = 12 * 1024 * 1024

const ALLOWED = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

r.post('/', async (c) => {
  const form = await c.req.formData()
  const file = form.get('file')
  const bucket = (form.get('bucket') || 'drinks').toString()

  if (!(file instanceof File)) {
    return c.json({ error: 'file field missing' }, 400)
  }
  if (!ALLOWED[file.type]) {
    return c.json({ error: `unsupported type: ${file.type}` }, 415)
  }
  if (file.size > MAX_BYTES) {
    return c.json({ error: 'file too large' }, 413)
  }

  const safeBucket = bucket.replace(/[^a-z0-9_-]/gi, '')
  const ext = ALLOWED[file.type] || extname(file.name) || '.bin'
  const filename = `${uid()}${ext}`
  const targetDir = resolve(UPLOAD_DIR, safeBucket)
  mkdirSync(targetDir, { recursive: true })

  const buf = Buffer.from(await file.arrayBuffer())
  writeFileSync(resolve(targetDir, filename), buf)

  const url = `${PUBLIC_URL}/uploads/${safeBucket}/${filename}`
  return c.json({ url, bucket: safeBucket, filename }, 201)
})

export default r
