/** Deployment gate: every approved cover must exist in Worker static assets. */
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SCRATCH_ARTWORKS} from '../public/scratch-artwork-catalogue.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..','public','scratch-artwork');
const actual=(await readdir(root)).filter(name=>/\.(jpe?g|webp)$/i.test(name));
assert.equal(SCRATCH_ARTWORKS.length,18);
assert.equal(new Set(SCRATCH_ARTWORKS.map(a=>a.id)).size,18);
assert.equal(new Set(SCRATCH_ARTWORKS.map(a=>a.label)).size,18);
assert.deepEqual(new Set(actual),new Set(SCRATCH_ARTWORKS.map(a=>a.file)));
for(const art of SCRATCH_ARTWORKS){
 const file=await readFile(resolve(root,art.file));
 assert.ok(file.length>100000,'Full-size image required: '+art.file);
 if(art.file.endsWith('.webp')){
  assert.equal(file.toString('ascii',0,4),'RIFF');
  assert.equal(file.toString('ascii',8,12),'WEBP');
  assert.equal(file.toString('ascii',12,16),'VP8 ');
  assert.equal(file.readUInt16LE(26)&0x3fff,1800,art.file);
  assert.equal(file.readUInt16LE(28)&0x3fff,2400,art.file);
 }else{assert.equal(file[0],0xff);assert.equal(file[1],0xd8);assert.equal(file[2],0xff);}
}
console.log('Verified all 18 approved cover assets.');
