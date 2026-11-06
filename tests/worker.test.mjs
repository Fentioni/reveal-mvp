import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogueResponse} from '../src/catalogue.js';
const cats=[{slug:'gifts-surprises',name:'Gifts & Surprises',description:null}];
const prod={id:'ticket-concert-reveal',slug:'ticket-concert-reveal',name:'Ticket & Concert Reveal',description:'A surprise',status:'active'};
function fakeDB() {return {
  prepare(sql) {return {
    bind(...args){this.args=args;return this},
    async all() {
      if(sql.includes('FROM categories WHERE active=1')) return {results:cats};
      if(sql.includes('FROM category_products cp JOIN products p')) return {results:[{...prod,categorySlug:'gifts-surprises'}]};
      if(sql.includes('FROM product_mechanics')) return {results:[{slug:'cinematic',name:'Cinematic Reveal',isDefault:1}]};
      if(sql.includes('FROM product_themes')) return {results:[{slug:'classic-gold',name:'Classic Gold',isDefault:1}]};
      if(sql.includes('FROM product_prices')) return {results:[{currency:'gbp',amount_minor:199,tax_behavior:'exclusive',country_code:null}]};
      if(sql.includes('FROM category_products cp JOIN categories c')) return {results:[{slug:'gifts-surprises',name:'Gifts & Surprises'}]};
      return {results:[]};
    },
    async first() {
      if(sql.includes('FROM categories WHERE active=1 AND slug=')) return this.args[0]==='gifts-surprises'?cats[0]:null;
      if(sql.includes('FROM products WHERE slug=')) return this.args[0]===prod.slug?prod:null;
      return null;
    }
  }}
}}
const q=(route, method='GET')=>new Request('https://reveal.test'+route,{method});
test('catalogue returns 11-compatible category and linked product arrays',async()=>{
  const r=await catalogueResponse(q('/api/catalogue'),{DB:fakeDB()});
  const x=await r.json();assert.equal(r.status,200);assert.equal(x.categories[0].slug,'gifts-surprises');
  assert.equal(x.products[0].slug,'ticket-concert-reveal');
  assert.match(x.checkoutNote,/Stripe Checkout/);
});
test('product page exposes only configured base price, not tax-inclusive guessed total',async()=>{
  const r=await catalogueResponse(q('/api/catalogue/products/ticket-concert-reveal'),{DB:fakeDB()});
  const x=await r.json();assert.equal(x.price.amount_minor,199);assert.equal(x.canCreate,true);
  assert.equal(x.mechanics[0].slug,'cinematic');assert.doesNotMatch(JSON.stringify(x),/£2\.39/);
});
test('unknown product returns 404',async()=>{
  assert.equal((await catalogueResponse(q('/api/catalogue/products/not-real'),{DB:fakeDB()})).status,404)
});
test('invalid slug returns 400',async()=>{
  assert.equal((await catalogueResponse(q('/api/catalogue/products/NOT_VALID'),{DB:fakeDB()})).status,400)
});
test('invalid currency returns 400',async()=>{
  assert.equal((await catalogueResponse(q('/api/catalogue?currency=abcdef'),{DB:fakeDB()})).status,400)
});
test('non-read methods blocked',async()=>{
  assert.equal((await catalogueResponse(q('/api/catalogue','POST'),{DB:fakeDB()})).status,405)
});
test('unavailable DB is a controlled 503',async()=>{
  assert.equal((await catalogueResponse(q('/api/catalogue'),{})).status,503)
});
test('HEAD API omits body',async()=>{
  const r=await catalogueResponse(q('/api/catalogue','HEAD'),{DB:fakeDB()});
  assert.equal(r.body,null);assert.equal(r.status,200)
});
