PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS drinks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  glass_type TEXT DEFAULT 'Cocktail',
  serving_type TEXT DEFAULT 'Shaker',
  garnish TEXT DEFAULT '',
  youtube_url TEXT DEFAULT '',
  spritbas TEXT DEFAULT 'Övrigt',
  tagline TEXT DEFAULT '',
  emoji TEXT DEFAULT '🍸',
  taste_profile TEXT DEFAULT '',
  style_description TEXT DEFAULT '',
  proportions_description TEXT DEFAULT '',
  history_intro TEXT DEFAULT '',
  history_theory_1 TEXT DEFAULT '',
  history_theory_2 TEXT DEFAULT '',
  history_conclusion TEXT DEFAULT '',
  iba_classification TEXT DEFAULT '',
  serving_occasion TEXT DEFAULT '',
  difficulty_level TEXT DEFAULT 'Medel',
  prep_time_minutes INTEGER DEFAULT 5,
  special_equipment TEXT DEFAULT '',
  temperature TEXT DEFAULT 'Kylt',
  ice_type TEXT DEFAULT 'Isbitar',
  food_pairing TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drink_images (
  id TEXT PRIMARY KEY,
  drink_id TEXT NOT NULL REFERENCES drinks(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drink_ingredients (
  id TEXT PRIMARY KEY,
  drink_id TEXT NOT NULL REFERENCES drinks(id) ON DELETE CASCADE,
  ingredient_name TEXT NOT NULL,
  amount TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS drink_instructions (
  id TEXT PRIMARY KEY,
  drink_id TEXT NOT NULL REFERENCES drinks(id) ON DELETE CASCADE,
  instruction TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS drink_variations (
  id TEXT PRIMARY KEY,
  drink_id TEXT NOT NULL REFERENCES drinks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  effect TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS drink_tips (
  id TEXT PRIMARY KEY,
  drink_id TEXT NOT NULL REFERENCES drinks(id) ON DELETE CASCADE,
  tip TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS garnish_options (
  id TEXT PRIMARY KEY,
  drink_id TEXT NOT NULL REFERENCES drinks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  effect TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS proportion_examples (
  id TEXT PRIMARY KEY,
  drink_id TEXT NOT NULL REFERENCES drinks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drink_tags (
  drink_id TEXT NOT NULL REFERENCES drinks(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (drink_id, tag_id)
);

CREATE TABLE IF NOT EXISTS occasion_tags (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  icon TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drink_occasions (
  drink_id TEXT NOT NULL REFERENCES drinks(id) ON DELETE CASCADE,
  occasion_tag_id TEXT NOT NULL REFERENCES occasion_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (drink_id, occasion_tag_id)
);

CREATE TABLE IF NOT EXISTS ingredients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT DEFAULT '',
  alcohol_content REAL,
  image_url TEXT,
  notes TEXT DEFAULT '',
  systembolaget_number TEXT DEFAULT '',
  systembolaget_url TEXT DEFAULT '',
  has_at_home INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_drinks_spritbas ON drinks(spritbas);
CREATE INDEX IF NOT EXISTS idx_drinks_created_at ON drinks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingredients_category ON ingredients(category);
CREATE INDEX IF NOT EXISTS idx_ingredients_has_at_home ON ingredients(has_at_home);
CREATE INDEX IF NOT EXISTS idx_drink_images_drink_id ON drink_images(drink_id);
CREATE INDEX IF NOT EXISTS idx_drink_ingredients_drink_id ON drink_ingredients(drink_id);
CREATE INDEX IF NOT EXISTS idx_drink_instructions_drink_id ON drink_instructions(drink_id);

CREATE TRIGGER IF NOT EXISTS drinks_updated_at
  AFTER UPDATE ON drinks
  FOR EACH ROW
BEGIN
  UPDATE drinks SET updated_at = datetime('now') WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS ingredients_updated_at
  AFTER UPDATE ON ingredients
  FOR EACH ROW
BEGIN
  UPDATE ingredients SET updated_at = datetime('now') WHERE id = OLD.id;
END;
