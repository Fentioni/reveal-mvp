import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('upgrade produces full replacement Worker while keeping legacy source intact',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'reveal-stage4b-'));
  try {
    const original=path.join(tmp,'reveal-mvp-main'),dest=path.join(tmp,'upgraded');
    fs.mkdirSync(path.join(original,'src'),{recursive:true});
    const legacy='export default { async fetch(request,env){return env.ASSETS.fetch(request)} };';
    fs.writeFileSync(path.join(original,'src','index.js'),legacy);
    fs.writeFileSync(path.join(original,'wrangler.jsonc'),'{"name":"reveal-mvp","main":"src/index.js","assets":{"directory":"./","binding":"ASSETS"}}');
    fs.writeFileSync(path.join(original,'index.html'),'<html><body>Stripe confirms the £2.39 payment. £2.39</body></html>');
    fs.writeFileSync(path.join(original,'reveal.html'),'<html><strong class="price">£2.39</strong><button>Pay £2.39 securely</button></html>');
    const run=spawnSync(process.execPath,[path.join(root,'tools','apply-stage4b.mjs'),original,dest],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    const report=JSON.parse(fs.readFileSync(path.join(dest,'STAGE4B-UPGRADE-REPORT.json')));
    assert.equal(report.categories,11);assert.equal(report.products,30);
    assert.equal(fs.readFileSync(path.join(dest,'src','legacy.js'),'utf8'),legacy);
    assert.match(fs.readFileSync(path.join(dest,'src','index.js'),'utf8'),/originalWorker\.fetch/);
    assert.doesNotMatch(fs.readFileSync(path.join(dest,'public','legacy-create.html'),'utf8'),/£2\.39/);
    assert.doesNotMatch(fs.readFileSync(path.join(dest,'public','reveal.html'),'utf8'),/£2\.39/);
    assert.match(fs.readFileSync(path.join(dest,'public','reveal.html'),'utf8'),/Continue to secure payment/);
    assert.ok(fs.existsSync(path.join(dest,'public','products','reveal-quest','index.html')));
    assert.ok(fs.existsSync(path.join(dest,'public','categories','gifts-surprises','index.html')));
    assert.ok(fs.existsSync(path.join(dest,'public','reveal.html')));
    assert.ok(!fs.existsSync(path.join(dest,'public','src','index.js')));
    assert.match(fs.readFileSync(path.join(dest,'wrangler.jsonc'),'utf8'),/"directory"\s*:\s*"\.\/public"/);
    assert.match(fs.readFileSync(path.join(dest,'wrangler.jsonc'),'utf8'),/"run_worker_first": true/);
  } finally {fs.rmSync(tmp,{recursive:true,force:true})}
});
