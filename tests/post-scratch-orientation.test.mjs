import {test} from 'node:test';
import assert from 'node:assert/strict';
import {POST_TEMPLATES} from '../public/post-scratch-catalogue.js';
import {checkPostSettings,DEFAULT_POST_SETTINGS} from '../public/post-scratch-settings.js';
import {photoFrame,photoGeometry} from '../public/post-scratch-renderer.js';
test('old settings retain template default, both orientations persist, invalid values rejected',()=>{
 assert.equal(checkPostSettings({}).imageOrientation,'auto');
 for(const imageOrientation of ['portrait','landscape'])assert.equal(checkPostSettings({...DEFAULT_POST_SETTINGS,imageOrientation}).imageOrientation,imageOrientation);
 assert.equal(checkPostSettings({imageOrientation:'diagonal'}),null);
});
test('all photo slots retain bounds and exact selected aspect ratio',()=>{
 for(const t of POST_TEMPLATES){
  const p=t.photo;assert.deepEqual(photoFrame(p,'auto'),p);
  for(const orientation of ['portrait','landscape']){
   const f=photoFrame(p,orientation);
   assert.ok(Math.abs(f.w/f.h-(orientation==='portrait'?0.75:4/3))<1e-10,t.id);
   assert.ok(f.x>=p.x-1e-8&&f.y>=p.y-1e-8&&f.x+f.w<=p.x+p.w+1e-8&&f.y+f.h<=p.y+p.h+1e-8,t.id);
   const g=photoGeometry(f,{imageFit:'cover',imageZoom:175,imagePanX:20});
   assert.equal(g.preserveAspectRatio,'xMidYMid slice');
  }
 }
});
