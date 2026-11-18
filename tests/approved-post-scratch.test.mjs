import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {APPROVED_POST_TEMPLATES as approved} from '../public/approved-post-scratch-catalogue.js';
import {POST_TEMPLATES,getPostTemplate} from '../public/post-scratch-catalogue.js';
import {checkPostSettings,DEFAULT_POST_SETTINGS} from '../public/post-scratch-settings.js';
import {defaultDesign,validateDesign} from '../public/template-design-schema.js';
test('64 approved, unique, grouped, backwards-compatible templates',()=>{
 assert.equal(approved.length,64);assert.equal(POST_TEMPLATES.length,79);assert.equal(new Set(POST_TEMPLATES.map(t=>t.id)).size,79);
 assert.equal(new Set(approved.map(t=>t.collection)).size,8);
 for(const t of approved){
  assert.equal(getPostTemplate(t.id),t);
  assert.equal(checkPostSettings({...DEFAULT_POST_SETTINGS,templateId:t.id}).templateId,t.id);
  assert.equal(validateDesign(t.id,defaultDesign(t.id)).zones.length,10);
  const boxes=[...t.zones,t.photo];
  for(const [i,a] of boxes.entries()){assert.ok(a.x>=0&&a.y>=0&&a.x+a.w<=900&&a.y+a.h<=1200,t.id);for(const b of boxes.slice(i+1))assert.ok(!(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y),t.id);}
 }
});
test('all 64 approved WebP assets exist and have the correct dimensions',async()=>{
 for(const t of approved){
  const b=await readFile(new URL('../public'+t.image,import.meta.url));
  assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.toString('ascii',8,12),'WEBP');
  let pos=12,wh;
  while(pos+8<=b.length){const tag=b.toString('ascii',pos,pos+4),n=b.readUInt32LE(pos+4),p=pos+8;if(tag==='VP8X')wh=[1+b.readUIntLE(p+4,3),1+b.readUIntLE(p+7,3)];else if(tag==='VP8 '&&!wh)wh=[b.readUInt16LE(p+6)&16383,b.readUInt16LE(p+8)&16383];else if(tag==='VP8L'&&!wh){const v=b.readUInt32LE(p+1);wh=[1+(v&16383),1+((v>>>14)&16383)];}pos=p+n+(n%2);}
  assert.deepEqual(wh,[1800,2400],t.id);
 }
});
