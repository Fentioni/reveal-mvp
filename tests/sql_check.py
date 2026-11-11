"""Stage 4B SQL validation against a clean database and an audited Stage 4A-shaped fixture.

The second fixture reconstructs the *reported* 12-product baseline. Its full
secondary mechanic/theme choices were not supplied, so those choices are
representative rather than an export of the real Cloudflare D1 database.
Never treat this as validation against production data.
"""
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGE4A = (ROOT / 'sql/00-stage4a-catalogue.sql').read_text()
STAGE4B = (ROOT / 'sql/01-stage4b-products.sql').read_text()

ORIGINAL = [
    ('surprise-trip', 'Surprise Trip', 'journey', 'travel-adventure'),
    ('gift-reveal', 'Gift Reveal', 'gift-box', 'classic-gold'),
    ('ticket-reveal', 'Ticket & Concert Reveal', 'cinematic', 'classic-gold'),
    ('pregnancy-announcement', 'Pregnancy Announcement', 'envelope', 'baby'),
    ('gender-reveal', 'Gender Reveal', 'gift-box', 'baby'),
    ('birthday-reveal', 'Birthday Reveal', 'gift-box', 'birthday-celebration'),
    ('romantic-proposal', 'Romantic & Proposal Reveal', 'envelope', 'romantic'),
    ('engagement-reveal', 'Engagement Reveal', 'cinematic', 'elegant-wedding'),
    ('newlywed-gift', 'Newlywed Gift Reveal', 'gift-box', 'elegant-wedding'),
    ('custom-reveal', 'Custom Reveal', 'envelope', 'custom'),
    ('three-question-quiz', 'Three-Question Quiz', 'mystery-clues', 'celebration'),
    ('reveal-quest', 'Reveal Quest', 'mystery-clues', 'travel-adventure'),
]

EXISTING_CATEGORY_LINKS = [
    ('gifts-surprises', 'gift-reveal'),
    ('gifts-surprises', 'ticket-reveal'),
    ('gifts-surprises', 'surprise-trip'),
    ('gifts-surprises', 'birthday-reveal'),
    ('gifts-surprises', 'newlywed-gift'),
    ('gifts-surprises', 'three-question-quiz'),
    ('gifts-surprises', 'reveal-quest'),
    ('trips-travel', 'surprise-trip'),
    ('trips-travel', 'reveal-quest'),
    ('baby-family', 'pregnancy-announcement'),
    ('baby-family', 'gender-reveal'),
    ('love-relationships', 'romantic-proposal'),
    ('love-relationships', 'engagement-reveal'),
    ('birthdays-celebrations', 'birthday-reveal'),
    ('birthdays-celebrations', 'three-question-quiz'),
    ('birthdays-celebrations', 'reveal-quest'),
    ('weddings-newlyweds', 'newlywed-gift'),
    ('weddings-newlyweds', 'engagement-reveal'),
    ('big-life-news', 'custom-reveal'),
    ('invitations-asks', 'custom-reveal'),
    ('results-achievements', 'custom-reveal'),
    ('seasonal', 'gift-reveal'),
    ('custom-reveal', 'custom-reveal'),
]


def database():
    db = sqlite3.connect(':memory:')
    db.execute('PRAGMA foreign_keys=ON')
    db.executescript("""
    CREATE TABLE reveals(id TEXT PRIMARY KEY, status TEXT);
    CREATE TABLE payments(id TEXT PRIMARY KEY, reveal_id TEXT REFERENCES reveals(id));
    CREATE TABLE reveal_assets(id TEXT PRIMARY KEY);
    CREATE TABLE stripe_events(id TEXT PRIMARY KEY);
    CREATE TABLE _cf_KV(key TEXT PRIMARY KEY, value BLOB) WITHOUT ROWID;
    INSERT INTO reveals VALUES('an-existing-reveal','paid');
    INSERT INTO payments VALUES('a-payment','an-existing-reveal');
    """)
    db.executescript(STAGE4A)
    return db


def count(db, table):
    # Table names below are defined by this test, never taken from user input.
    return db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]


def assert_integrity(db):
    assert db.execute('PRAGMA foreign_key_check').fetchall() == []
    assert count(db, 'reveals') == 1
    assert count(db, 'payments') == 1
    assert db.execute('SELECT status FROM reveals').fetchone()[0] == 'paid'


def assert_catalogue(db, expected_categories, expected_mechanics, expected_themes):
    expected = {
        'categories': 11, 'products': 30, 'mechanics': 6, 'themes': 10,
        'category_products': expected_categories,
        'product_mechanics': expected_mechanics,
        'product_themes': expected_themes,
        'product_prices': 1,
    }
    for table, amount in expected.items():
        actual = count(db, table)
        assert actual == amount, (table, actual, amount)
    assert db.execute("SELECT COUNT(*) FROM products WHERE status='active'").fetchone()[0] == 0
    for obsolete in ('ticket-concert-reveal', 'romantic-proposal-reveal', 'newlywed-gift-reveal'):
        assert db.execute('SELECT COUNT(*) FROM products WHERE id=?', (obsolete,)).fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM products WHERE id='ticket-reveal'").fetchone()[0] == 1
    assert db.execute("SELECT product_id,currency,amount_minor FROM product_prices").fetchone() == (
        'ticket-reveal', 'gbp', 199
    )
    assert_integrity(db)


def audit_shaped_existing_data(db):
    """Reconstruct known IDs/defaults/mappings and reported 43/61 mapping counts.

    Extra non-default choices are simulated, not claimed to represent actual D1 rows.
    """
    for position, (product_id, name, _, _) in enumerate(ORIGINAL, 1):
        db.execute(
            "INSERT INTO products(id,slug,name,status,sort_order) VALUES(?,?,?,?,?)",
            (product_id, product_id, name, 'draft', position),
        )

    for position, (category, product) in enumerate(EXISTING_CATEGORY_LINKS, 1):
        db.execute(
            "INSERT INTO category_products(category_id,product_id,sort_order) VALUES(?,?,?)",
            (category, product, position),
        )

    all_mechanics = [row[0] for row in db.execute("SELECT id FROM mechanics ORDER BY id")]
    all_themes = [row[0] for row in db.execute("SELECT id FROM themes ORDER BY id")]

    # Three products' individual counts were supplied. The remaining counts
    # are constructed to match the audited totals without assuming their IDs.
    four_mechanic_choices = {
        'ticket-reveal', 'romantic-proposal', 'newlywed-gift',
        'surprise-trip', 'gift-reveal', 'pregnancy-announcement', 'gender-reveal'
    }
    special_theme_counts = {
        'ticket-reveal': 5, 'romantic-proposal': 4, 'newlywed-gift': 5,
        'surprise-trip': 6, 'gift-reveal': 6
    }

    for product_id, _, default_mechanic, default_theme in ORIGINAL:
        mechanic_total = 4 if product_id in four_mechanic_choices else 3
        theme_total = special_theme_counts.get(product_id, 5)
        compatible_mechanics = [default_mechanic] + [
            option for option in all_mechanics if option != default_mechanic
        ][:mechanic_total - 1]
        compatible_themes = [default_theme] + [
            option for option in all_themes if option != default_theme
        ][:theme_total - 1]

        for position, choice in enumerate(compatible_mechanics):
            db.execute(
                "INSERT INTO product_mechanics(product_id,mechanic_id,is_default,sort_order) VALUES(?,?,?,?)",
                (product_id, choice, int(position == 0), position),
            )
        for position, choice in enumerate(compatible_themes):
            db.execute(
                "INSERT INTO product_themes(product_id,theme_id,is_default,sort_order) VALUES(?,?,?,?)",
                (product_id, choice, int(position == 0), position),
            )

    assert count(db, 'products') == 12
    assert count(db, 'category_products') == 23
    assert count(db, 'product_mechanics') == 43
    assert count(db, 'product_themes') == 61


def snapshot(db):
    return {
        table: set(db.execute(f'SELECT * FROM {table}').fetchall())
        for table in ('products', 'category_products', 'product_mechanics', 'product_themes')
    }


def test_clean_install():
    db = database()
    db.executescript(STAGE4B)
    assert_catalogue(db, 32, 30, 30)
    db.executescript(STAGE4B)
    assert_catalogue(db, 32, 30, 30)
    print('PASS: clean installation, 30 draft products, original records, idempotence')


def test_audited_stage4a_extension():
    db = database()
    audit_shaped_existing_data(db)
    before = snapshot(db)
    db.executescript(STAGE4B)
    assert_catalogue(db, 43, 61, 79)
    after = snapshot(db)
    for table in before:
        assert before[table].issubset(after[table]), f'Existing {table} records were changed'

    for product_id, _, mechanic, theme in ORIGINAL:
        assert db.execute(
            'SELECT mechanic_id FROM product_mechanics WHERE product_id=? AND is_default=1',
            (product_id,),
        ).fetchone()[0] == mechanic
        assert db.execute(
            'SELECT theme_id FROM product_themes WHERE product_id=? AND is_default=1',
            (product_id,),
        ).fetchone()[0] == theme

    db.executescript(STAGE4B)
    assert_catalogue(db, 43, 61, 79)
    assert snapshot(db) == after
    print('PASS: audited-shaped baseline preserved; no duplicate IDs, defaults or mappings')


if __name__ == '__main__':
    test_clean_install()
    test_audited_stage4a_extension()
