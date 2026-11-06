-- Reveal Stage 4A - additive, rerunnable catalogue foundation.
-- Does not modify or delete reveals, payments, reveal_assets, stripe_events, _cf_KV.
CREATE TABLE IF NOT EXISTS categories (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 description TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
 active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS products (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 description TEXT, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','archived')),
 sort_order INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS category_products (
 category_id TEXT NOT NULL REFERENCES categories(id),
 product_id TEXT NOT NULL REFERENCES products(id),
 sort_order INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(category_id,product_id));
CREATE TABLE IF NOT EXISTS mechanics (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 description TEXT, settings_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(settings_json)),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS themes (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 description TEXT, settings_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(settings_json)),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS product_mechanics (
 product_id TEXT NOT NULL REFERENCES products(id),
 mechanic_id TEXT NOT NULL REFERENCES mechanics(id),
 is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
 sort_order INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(product_id,mechanic_id));
CREATE UNIQUE INDEX IF NOT EXISTS ux_product_mechanics_default
 ON product_mechanics(product_id) WHERE is_default=1;
CREATE TABLE IF NOT EXISTS product_themes (
 product_id TEXT NOT NULL REFERENCES products(id),
 theme_id TEXT NOT NULL REFERENCES themes(id),
 is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
 sort_order INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(product_id,theme_id));
CREATE UNIQUE INDEX IF NOT EXISTS ux_product_themes_default
 ON product_themes(product_id) WHERE is_default=1;
CREATE TABLE IF NOT EXISTS product_fields (
 id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id),
 field_key TEXT NOT NULL, label TEXT NOT NULL, field_type TEXT NOT NULL,
 required INTEGER NOT NULL DEFAULT 0 CHECK(required IN (0,1)),
 settings_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(settings_json)),
 sort_order INTEGER NOT NULL DEFAULT 0,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 UNIQUE(product_id,field_key));
CREATE TABLE IF NOT EXISTS product_prices (
 id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id),
 currency TEXT NOT NULL, country_code TEXT,
 amount_minor INTEGER NOT NULL CHECK(amount_minor >= 0),
 tax_behavior TEXT NOT NULL DEFAULT 'exclusive' CHECK(tax_behavior IN ('exclusive','inclusive','unspecified')),
 stripe_price_id TEXT,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(country_code IS NULL OR length(country_code)=2));
CREATE UNIQUE INDEX IF NOT EXISTS ux_product_prices_active_scope
 ON product_prices(product_id,currency,COALESCE(country_code,'')) WHERE active=1;
CREATE TABLE IF NOT EXISTS reveal_configurations (
 reveal_id TEXT PRIMARY KEY REFERENCES reveals(id),
 product_id TEXT NOT NULL REFERENCES products(id),
 mechanic_id TEXT, theme_id TEXT,
 fields_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(fields_json)),
 schema_version INTEGER NOT NULL DEFAULT 1 CHECK(schema_version > 0),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(product_id,mechanic_id) REFERENCES product_mechanics(product_id,mechanic_id),
 FOREIGN KEY(product_id,theme_id) REFERENCES product_themes(product_id,theme_id));
CREATE TABLE IF NOT EXISTS reveal_events (
 id TEXT PRIMARY KEY, reveal_id TEXT NOT NULL REFERENCES reveals(id),
 event_type TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS ix_category_products_product ON category_products(product_id);
CREATE INDEX IF NOT EXISTS ix_product_fields_product ON product_fields(product_id,sort_order);
CREATE INDEX IF NOT EXISTS ix_reveal_configurations_product ON reveal_configurations(product_id);
CREATE INDEX IF NOT EXISTS ix_reveal_events_reveal_time ON reveal_events(reveal_id,created_at);
CREATE INDEX IF NOT EXISTS ix_product_prices_product ON product_prices(product_id,currency);
INSERT OR IGNORE INTO categories(id,slug,name,sort_order) VALUES
('gifts-surprises','gifts-surprises','Gifts & Surprises',1),
('trips-travel','trips-travel','Trips & Travel',2),
('baby-family','baby-family','Baby & Family',3),
('love-relationships','love-relationships','Love & Relationships',4),
('birthdays-celebrations','birthdays-celebrations','Birthdays & Celebrations',5),
('weddings-newlyweds','weddings-newlyweds','Weddings & Newlyweds',6),
('big-life-news','big-life-news','Big Life News',7),
('invitations-asks','invitations-asks','Invitations & Asks',8),
('results-achievements','results-achievements','Results & Achievements',9),
('seasonal','seasonal','Seasonal',10),
('custom-reveal','custom-reveal','Custom Reveal',11);
INSERT OR IGNORE INTO mechanics(id,slug,name) VALUES
('gift-box','gift-box','Gift Box Reveal'),
('envelope','envelope','Envelope Reveal'),
('cinematic','cinematic','Cinematic Reveal'),
('scratch','scratch','Scratch Reveal'),
('mystery-clues','mystery-clues','Mystery & Clues'),
('journey','journey','Journey Reveal');
INSERT OR IGNORE INTO themes(id,slug,name) VALUES
('classic-gold','classic-gold','Classic Gold'),
('travel-adventure','travel-adventure','Travel Adventure'),
('romantic','romantic','Romantic'),
('birthday-celebration','birthday-celebration','Birthday Celebration'),
('elegant-wedding','elegant-wedding','Elegant Wedding'),
('baby','baby','Baby'),
('christmas','christmas','Christmas'),
('celebration','celebration','Celebration'),
('theme-park-magic','theme-park-magic','Theme Park Magic'),
('custom','custom','Custom');
