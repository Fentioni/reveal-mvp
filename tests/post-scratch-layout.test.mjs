import {test} from 'node:test';
import assert from 'node:assert/strict';
import {POST_TEMPLATES} from '../public/post-scratch-catalogue.js';
import {defaultDesign,validateDesign,assertTemplateLayout} from '../public/template-design-schema.js';
import {photoFrame} from '../public/post-scratch-renderer.js';
test('every template retains all ten visible fields with non-overlapping geometry',()=>{
 assert.equal(POST_TEMPLATES.length,79);
 for(const t of POST_TEMPLATES){
  const d=assertTemplateLayout(validateDesign(t.id,defaultDesign(t.id)));
  for(const orientation of ['auto','portrait','landscape'])assertTemplateLayout({...d,photo:photoFrame(d.photo,orientation)});
  if(t.approvedArtwork){
   const z=Object.fromEntries(d.zones.map(z=>[z.key,z]));
   assert.ok(z.eventName.y+z.eventName.h<z.subtitle.y&&z.subtitle.y+z.subtitle.h<z.recipient.y);
   assert.ok(z.recipient.y+z.recipient.h<d.photo.y&&d.photo.y+d.photo.h<z.date.y);
   assert.ok(z.date.y===z.time.y&&z.venue.y>z.date.y&&z.venueAddress.y>z.venue.y&&z.message.y>z.venueAddress.y&&z.senderLine.y>z.message.y&&z.link.y>z.senderLine.y);
  }
 }
});
test('publishing rejects hidden fields and overlaps',()=>{
 const t=defaultDesign('bg-classic-celebration');
 t.zones[0].hidden=true;assert.throws(()=>assertTemplateLayout(t),/ten editable fields/);
 t.zones[0].hidden=false;Object.assign(t.zones[1],{x:t.zones[0].x,y:t.zones[0].y});
 assert.throws(()=>assertTemplateLayout(t),/overlap/);
});
