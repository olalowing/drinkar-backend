import { applySchema, db } from './db.js'

applySchema()
console.log('Schema applied at', db.name)
