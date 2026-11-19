import test from 'node:test';
import assert from 'node:assert/strict';
import {checkCustomerLayout,validateCustomerLayout,applyCustomerLayout} from '../public/customer-ticket-layout.js';
import {getPostTemplate} from '../public/post-scratch-catalogue.js';
test('customer layout only changes approved properties and leaves master unchanged',()=>{
 const master=getPostTemplate('bg-luxury-champagne-gold'),original=JSON.stringify(master),z=master.zones[0];
 const layout={[z.key]:{ink:'#ff0033',size:32,family:'Arial, sans-serif',italic:true,weight:700,align:'right'}};
 const t=validateCustomerLayout(master,layout);assert.equal(t.zones[0].ink,'#ff0033');assert.equal(t.zones[0].size,32);assert.equal(JSON.stringify(master),original);
 for(const bad of [{eventName:{hidden:true}},{eventName:{ink:'red'}},{eventName:{family:'url(foo)'}},{__bad:{x:1}},{image:{size:32}}])assert.equal(checkCustomerLayout(bad),null);
 assert.throws(()=>validateCustomerLayout(master,{eventName:{x:899,w:100}}),/inside/);
 assert.throws(()=>validateCustomerLayout(master,{image:{x:0,y:0,w:900,h:1200}}),/overlaps/);
 assert.equal(getPostTemplate('custom-image'),undefined,'Standalone full-image template was retired');
});
