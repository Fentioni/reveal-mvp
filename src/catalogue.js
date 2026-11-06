/** Reveal catalogue API. Read-only; never uses purchaser credentials or pricing guesses. */
const RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const baseHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'public, max-age=30',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer'
};
const answer = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: baseHeaders });
const safeSlug = (str) => RE.test(str) && str.length <= 100;
const readAll = async (db, sql, params = []) => {
  const statement = db.prepare(sql);
  return (await (params.length ? statement.bind(...params) : statement).all()).results ?? [];
};
const readOne = async (db, sql, params = []) => {
  const statement = db.prepare(sql);
  return (params.length ? statement.bind(...params) : statement).first();
};

const prices = async (db, productId, currency) => {
  const entries = await readAll(db,
    `SELECT currency,amount_minor,tax_behavior,country_code
       FROM product_prices
      WHERE product_id=? AND active=1 AND currency=? AND country_code IS NULL
      ORDER BY created_at DESC LIMIT 1`, [productId,currency]);
  return entries[0] ?? null;
};

const configForProduct = async (db, productId) => {
  const mechanics = await readAll(db,
    `SELECT m.slug,m.name,pm.is_default AS isDefault
       FROM product_mechanics pm JOIN mechanics m ON m.id=pm.mechanic_id
      WHERE pm.product_id=? AND m.active=1 ORDER BY pm.is_default DESC,pm.sort_order,m.name`,[productId]);
  const themes = await readAll(db,
    `SELECT t.slug,t.name,pt.is_default AS isDefault
       FROM product_themes pt JOIN themes t ON t.id=pt.theme_id
      WHERE pt.product_id=? AND t.active=1 ORDER BY pt.is_default DESC,pt.sort_order,t.name`,[productId]);
  return {mechanics,themes};
};

export async function catalogueResponse(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return answer({error:'Method not allowed'},405);
  if (!env.DB) return answer({error:'Catalogue database unavailable'},503);
  const {pathname,searchParams} = new URL(request.url);
  const currency = (searchParams.get('currency') || 'gbp').toLowerCase();
  if (!/^[a-z]{3}$/.test(currency)) return answer({error:'Invalid currency'},400);
  let response;
  try {
    if (pathname === '/api/catalogue') {
      const categories = await readAll(env.DB,
        'SELECT slug,name,description FROM categories WHERE active=1 ORDER BY sort_order,name');
      const products = await readAll(env.DB,
        `SELECT p.slug,p.name,p.description,p.status,cp.category_id AS categorySlug
           FROM category_products cp JOIN products p ON p.id=cp.product_id
          JOIN categories c ON c.id=cp.category_id
          WHERE c.active=1 AND p.status!='archived'
          ORDER BY c.sort_order,cp.sort_order,p.name`);
      response = answer({categories,products,currency,checkoutNote:'Final amount and any applicable taxes are confirmed at Stripe Checkout.'});
    } else if (pathname.startsWith('/api/catalogue/categories/')) {
      const slug = pathname.split('/')[4] ?? '';
      if (!safeSlug(slug)) return answer({error:'Invalid category'},400);
      const category = await readOne(env.DB,
        'SELECT slug,name,description FROM categories WHERE active=1 AND slug=?',[slug]);
      if (!category) return answer({error:'Category not found'},404);
      const products = await readAll(env.DB,
        `SELECT p.slug,p.name,p.description,p.status
           FROM category_products cp JOIN products p ON p.id=cp.product_id
          WHERE cp.category_id=? AND p.status!='archived' ORDER BY cp.sort_order,p.name`,[slug]);
      response = answer({category,products});
    } else if (pathname.startsWith('/api/catalogue/products/')) {
      const slug = pathname.split('/')[4] ?? '';
      if (!safeSlug(slug)) return answer({error:'Invalid product'},400);
      const product = await readOne(env.DB,
        `SELECT id,slug,name,description,status FROM products WHERE slug=? AND status!='archived'`,[slug]);
      if (!product) return answer({error:'Product not found'},404);
      const categories = await readAll(env.DB,
        `SELECT c.slug,c.name FROM category_products cp JOIN categories c ON c.id=cp.category_id
          WHERE cp.product_id=? AND c.active=1 ORDER BY cp.sort_order`,[product.id]);
      const configured = await configForProduct(env.DB,product.id);
      const price = await prices(env.DB,product.id,currency);
      response = answer({product:{slug:product.slug,name:product.name,description:product.description,status:product.status},
        categories,...configured,price,
        canCreate:product.status==='active' && product.slug==='ticket-concert-reveal',
        checkoutNote:'Prices shown are base prices. The final payable total, local currency and applicable taxes are confirmed securely at Stripe Checkout.'});
    } else {
      response = answer({error:'Catalogue route not found'},404);
    }
  } catch (e) {
    console.error('Catalogue query failed', e?.name ?? 'Error');
    response = answer({error:'Catalogue unavailable. Check that Stage 4A and Stage 4B migrations are applied.'},503);
  }
  return request.method === 'HEAD'
    ? new Response(null,{status:response.status,headers:response.headers}) : response;
}
