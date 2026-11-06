"""Optional local visual smoke test; renders from fixture data without external network."""
import json,re,pathlib,sqlite3
from playwright.sync_api import sync_playwright
R=pathlib.Path(__file__).resolve().parents[1]
con=sqlite3.connect(':memory:');con.row_factory=sqlite3.Row
con.executescript('CREATE TABLE reveals(id TEXT PRIMARY KEY);')
for file in ('00-stage4a-catalogue.sql','01-stage4b-products.sql'):
  con.executescript((R/'sql'/file).read_text())
fixture={}
fixture['/api/catalogue']={
  'categories':[dict(r) for r in con.execute('SELECT slug,name,description FROM categories ORDER BY sort_order')],
  'products':[dict(r) for r in con.execute('''SELECT p.slug,p.name,p.description,p.status,c.slug AS categorySlug
    FROM category_products cp JOIN products p ON p.id=cp.product_id JOIN categories c ON cp.category_id=c.id
    WHERE p.status != 'archived' ORDER BY c.sort_order,cp.sort_order''')]}
for row in con.execute('SELECT slug,name,description FROM categories ORDER BY sort_order'):
  slug=row['slug']
  fixture['/api/catalogue/categories/'+slug]={
   'category':dict(row),
   'products':[dict(r) for r in con.execute('''SELECT p.slug,p.name,p.description,p.status
      FROM category_products cp JOIN products p ON p.id=cp.product_id
      WHERE cp.category_id=? ORDER BY cp.sort_order''',(slug,))]}
for row in con.execute('SELECT id,slug,name,description,status FROM products'):
  slug=row['slug']
  fixture['/api/catalogue/products/'+slug]={
   'product':dict(row),
   'mechanics':[dict(r) for r in con.execute('SELECT m.slug,m.name,pm.is_default AS isDefault FROM product_mechanics pm JOIN mechanics m ON m.id=pm.mechanic_id WHERE pm.product_id=?',(slug,))],
   'themes':[dict(r) for r in con.execute('SELECT t.slug,t.name,pt.is_default AS isDefault FROM product_themes pt JOIN themes t ON t.id=pt.theme_id WHERE pt.product_id=?',(slug,))],
   'price':next((dict(r) for r in con.execute('SELECT currency,amount_minor,tax_behavior FROM product_prices WHERE product_id=?',(slug,))),None),
   'categories':[dict(r) for r in con.execute('SELECT c.name,c.slug FROM category_products cp JOIN categories c ON c.id=cp.category_id WHERE cp.product_id=?',(slug,))],
   'canCreate':slug=='ticket-concert-reveal',
   'checkoutNote':'The final payable amount, local currency and applicable taxes are confirmed at Stripe Checkout.'}
html=(R/'assets/storefront.html').read_text()
html=re.sub(r'<link[^>]*storefront\.css[^>]*>','',html)
html=re.sub(r'<script[^>]*storefront\.js[^>]*></script>','',html)
css=(R/'assets/storefront.css').read_text()
js=(R/'assets/storefront.js').read_text()
with sync_playwright() as playwright:
  browser=playwright.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for label,viewport in [('desktop',{'width':1440,'height':900}),('mobile',{'width':390,'height':844})]:
    page=browser.new_page(viewport=viewport,device_scale_factor=1)
    page.set_content(html)
    page.evaluate('''(fixture) => {window.fetch = async (url) => {
      const key=String(url).split('?')[0];
      const d=fixture[key];
      return {ok:!!d,status:d?200:404,json:async()=>d||{error:'Not found'}};
    }}''',fixture)
    page.add_style_tag(content=css)
    page.add_script_tag(content=js)
    page.wait_for_function("document.querySelectorAll('.tile.category').length === 11")
    assert page.locator('.tile').count()>=17
    assert page.locator('h1').count()==1
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.screenshot(path=f'/mnt/data/reveal_stage4b_{label}.png',full_page=True)
    page.evaluate("async () => await productPage('ticket-concert-reveal')")
    assert page.get_by_text('Base price: £1.99',exact=False).count()==1
    assert page.get_by_text('£2.39').count()==0
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.screenshot(path=f'/mnt/data/reveal_stage4b_product_{label}.png',full_page=True)
    print(label,'homepage and product page OK')
    page.close()
  browser.close()
