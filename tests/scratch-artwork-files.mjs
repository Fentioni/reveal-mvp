/** Deployment gate: all 20 approved images must actually exist in Cloudflare static assets. */
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SCRATCH_ARTWORKS} from '../public/scratch-artwork-catalogue.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..','public','scratch-artwork');
const actual=(await readdir(root)).filter(name=>/\.jpe?g$/i.test(name));
assert.equal(SCRATCH_ARTWORKS.length,20);
const intended=new Set(SCRATCH_ARTWORKS.map(art=>art.file));
assert.deepEqual(new Set(actual),intended,'Exactly the 20 supplied JPEGs must be present in public/scratch-artwork.');
for(const art of SCRATCH_ARTWORKS){
 const file=await readFile(resolve(root,art.file));
 assert.ok(file.length>100000,'Artwork must be a full-size JPEG: '+art.file);
 assert.equal(file[0],0xff,art.file);assert.equal(file[1],0xd8,art.file);assert.equal(file[2],0xff,art.file);
}
console.log('Verified all 20 full-size approved JPEGs in Worker static assets.');
