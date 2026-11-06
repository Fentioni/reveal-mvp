import sqlite3
from pathlib import Path
ROOT=Path(__file__).parents[1]
con=sqlite3.connect(':memory:')
con.execute('PRAGMA foreign_keys=ON')
con.executescript('''
CREATE TABLE reveals(id TEXT PRIMARY KEY, status TEXT);
CREATE TABLE payments(id TEXT PRIMARY KEY, reveal_id TEXT REFERENCES reveals(id));
CREATE TABLE reveal_assets(id TEXT PRIMARY KEY);
CREATE TABLE stripe_events(id TEXT PRIMARY KEY);
CREATE TABLE _cf_KV(key TEXT PRIMARY KEY, value BLOB) WITHOUT ROWID;
INSERT INTO reveals VALUES('an-existing-reveal','paid');
INSERT INTO payments VALUES('a-payment','an-existing-reveal');
''')
for _ in range(2):
  for name in ('00-stage4a-catalogue.sql','01-stage4b-products.sql'):
    con.executescript((ROOT/'sql'/name).read_text())
expected={'categories':11,'products':30,'mechanics':6,'themes':10,'product_prices':1,'category_products':32,'payments':1,'reveals':1}
for table,count in expected.items():
  actual=con.execute('SELECT COUNT(*) FROM '+table).fetchone()[0]
  assert actual==count,(table,actual,count)
assert con.execute("SELECT COUNT(*) FROM products WHERE status='active'").fetchone()[0]==1
assert con.execute("SELECT slug FROM products WHERE status='active'").fetchone()[0]=='ticket-concert-reveal'
assert con.execute('PRAGMA foreign_key_check').fetchall()==[]
print('PASS: idempotent SQL, original records preserved, 30 product records, zero foreign-key violations')
