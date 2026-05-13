import Database from 'better-sqlite3'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const dbPath = resolve(process.env.DB_PATH || './data/drinkar.db')
mkdirSync(dirname(dbPath), { recursive: true })

export const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.pragma('busy_timeout = 5000')

export function applySchema() {
  const schemaPath = resolve(import.meta.dirname, 'schema.sql')
  const sql = readFileSync(schemaPath, 'utf8')
  db.exec(sql)
}

export function uid() {
  return crypto.randomUUID()
}
