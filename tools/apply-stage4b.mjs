#!/usr/bin/env node
/* One-command Stage 4B migration of an existing Reveal source directory.
 * Preserves the original Worker exactly in src/legacy.js and all prior assets.
 * Generates full replacement files; does not deploy or touch Cloudflare data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const kit = path.resolve(here,'..');
const source = path.resolve(process.argv[2] || '');
const target = path.resolve(process.argv[3] || path.join(process.cwd(),'reveal-mvp-stage4b'));
const fail = (msg) => {console.error('Stage 4B:',msg);process.exit(1)};
if (!process.argv[2]) fail('Provide the extracted original project directory as the first argument.');
if (!fs.existsSync(source)) fail('Original source folder not found: '+source);
if (!fs.existsSync(path.join(source,'src/index.js'))) fail('Original src/index.js missing.');
if (!fs.existsSync(path.join(source,'wrangler.jsonc'))) fail('Original wrangler.jsonc missing.');
if (source===target || target.startsWith(source+path.sep)) fail('Output must be outside the original source directory.');
if (fs.existsSync(target)) fail('Output already exists. Choose a new directory to prevent overwriting.');
const config=fs.readFileSync(path.join(source,'wrangler.jsonc'),'utf8');
const assetsSection = config.match(/"assets"\s*:\s*\{([\s\S]*?)\}/);
if (!assetsSection) fail('wrangler.jsonc has no static assets binding; check original configuration.');
const assetsDirectory = assetsSection[1]?.match(/"directory"\s*:\s*"([^"]+)"/)?.[1] || './';
if (/^(\/|[A-Za-z]:|\.\.\/)/.test(assetsDirectory)) fail('Unsafe assets directory in wrangler.jsonc.');
const assetPath = path.resolve(source,assetsDirectory);
if (!assetPath.startsWith(source+path.sep) && assetPath!==source) fail('Assets directory outside original repo.');
if (!fs.existsSync(path.join(assetPath,'index.html'))) fail('Original index.html not found in '+assetPath);
const srcCode=fs.readFileSync(path.join(source,'src/index.js'),'utf8');
if (!/export\s+default/.test(srcCode)) fail('Original worker has no default export. Aborting to avoid a breaking replacement.');
fs.cpSync(source,target,{recursive:true});
// If the original exposed the repository root as static assets, relocate public files
// into /public to avoid serving Worker source, SQL, Wrangler or secrets.
let outAssets = path.resolve(target,assetsDirectory);
if (outAssets===target) {
  outAssets=path.join(target,'public');
  fs.mkdirSync(outAssets,{recursive:true});
  const blocked = new Set(['src','sql','tools','tests','.git','.github','node_modules','.wrangler']);
  const allowed = /\.(?:html|css|js|png|jpg|jpeg|webp|svg|gif|ico|woff2?|ttf|webmanifest)$/i;
  function copyPublic(from, relative='') {
    for(const item of fs.readdirSync(from,{withFileTypes:true})) {
      if(!relative && blocked.has(item.name)) continue;
      if(item.name.startsWith('.')) continue;
      const rel=path.join(relative,item.name), src=path.join(from,item.name), dest=path.join(outAssets,rel);
      if(item.isDirectory()) copyPublic(src,rel);
      else if(item.isFile() && allowed.test(item.name)) {
        fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(src,dest);
      }
    }
  }
  copyPublic(source);
  let updated=fs.readFileSync(path.join(target,'wrangler.jsonc'),'utf8');
  if (/"assets"\s*:\s*\{[\s\S]*?"directory"\s*:\s*"[^"]+"/.test(updated)) {
    updated=updated.replace(/("assets"\s*:\s*\{[\s\S]*?"directory"\s*:\s*")[^"]+(")/, '$1./public$2');
  } else {
    updated=updated.replace(/("assets"\s*:\s*\{)/,'$1\n    "directory": "./public",');
  }
  fs.writeFileSync(path.join(target,'wrangler.jsonc'),updated);
}
// All requests first reach the Worker, which delegates existing routes to legacy.js.
// This guarantees catalogue APIs work even if the original used SPA asset fallback.
{
  let updated=fs.readFileSync(path.join(target,'wrangler.jsonc'),'utf8');
  if (/"run_worker_first"\s*:/.test(updated)) {
    updated=updated.replace(/"run_worker_first"\s*:\s*(true|false|\[[^\]]*\])/,
      '"run_worker_first": true');
  } else {
    updated=updated.replace(/("assets"\s*:\s*\{)/,'$1\n    "run_worker_first": true,');
  }
  fs.writeFileSync(path.join(target,'wrangler.jsonc'),updated);
}

const outSrc = path.join(target,'src');
fs.copyFileSync(path.join(outSrc,'index.js'),path.join(outSrc,'legacy.js'));
fs.copyFileSync(path.join(kit,'src','index.js'),path.join(outSrc,'index.js'));
fs.copyFileSync(path.join(kit,'src','catalogue.js'),path.join(outSrc,'catalogue.js'));
fs.copyFileSync(path.join(outAssets,'index.html'),path.join(outAssets,'legacy-create.html'));
let oldHtml = fs.readFileSync(path.join(outAssets,'legacy-create.html'),'utf8');
const originalHtml = oldHtml;
// Never assert a UK tax-inclusive checkout total before Stripe determines the buyer's tax/currency.
oldHtml=oldHtml.replace(/(?:£|&pound;|&#0*163;|&#x0*a3;|\\u00a3)\s*2\.39/gi,'Final total shown at secure checkout');
oldHtml=oldHtml.replace(/Your reveal remains locked until Stripe confirms the[^<.\n]+payment\./gi,
 'Your reveal remains locked until successful payment is confirmed.');
fs.writeFileSync(path.join(outAssets,'legacy-create.html'),oldHtml);
// The original ticket checkout/review screen is reveal.html, not index.html.
// Remove every user-visible fixed tax-inclusive amount; Stripe determines the total.
const reviewPath=path.join(outAssets,'reveal.html');
if (!fs.existsSync(reviewPath)) fail('Original reveal.html is missing. Aborting to avoid leaving fixed checkout wording.');
const reviewBefore=fs.readFileSync(reviewPath,'utf8');
let reviewAfter=reviewBefore
  .replace(/Pay\s*(?:£|&pound;|&#0*163;|&#x0*a3;|\\u00a3)\s*2\.39\s*securely/gi,'Continue to secure payment')
  .replace(/(?:£|&pound;|&#0*163;|&#x0*a3;|\\u00a3)\s*2\.39/gi,'Final total shown at checkout')
  .replace(/Your reveal remains locked until Stripe confirms the[^<.\n]+payment\./gi,'Your reveal remains locked until successful payment is confirmed.');
fs.writeFileSync(reviewPath,reviewAfter);

for (const file of ['storefront.html','storefront.css','storefront.js']) {
  fs.copyFileSync(path.join(kit,'assets',file),path.join(outAssets,file));
}
fs.copyFileSync(path.join(kit,'assets','storefront.html'),path.join(outAssets,'index.html'));
function staticPage(relative) {
  const dir=path.join(outAssets,relative);fs.mkdirSync(dir,{recursive:true});
  fs.copyFileSync(path.join(kit,'assets','storefront.html'),path.join(dir,'index.html'));
}
const categorySlugs=['gifts-surprises','trips-travel','baby-family','love-relationships','birthdays-celebrations','weddings-newlyweds','big-life-news','invitations-asks','results-achievements','seasonal','custom-reveal'];
const sql=fs.readFileSync(path.join(kit,'sql','01-stage4b-products.sql'),'utf8');
const productSlugs=Array.from(sql.matchAll(/\('([a-z0-9-]+)','\1','[^']+'/g),x=>x[1]);
// Product slug list is read from the authoritative SQL INSERT values, not manually duplicated.
for(const slug of categorySlugs) staticPage(path.join('categories',slug));
for(const slug of new Set(productSlugs)) staticPage(path.join('products',slug));
staticPage('reveal-quest');staticPage('three-question-quiz');
fs.mkdirSync(path.join(target,'sql'),{recursive:true});
for(const name of ['00-stage4a-catalogue.sql','01-stage4b-products.sql']) fs.copyFileSync(path.join(kit,'sql',name),path.join(target,'sql',name));
const report = {baseWorkerPreserved:true,htmlPriceLabelRemoved:oldHtml!==originalHtml || reviewAfter!==reviewBefore,reviewPriceLabelRemoved:!/(?:£|&pound;|&#0*163;|&#x0*a3;)\s*2\.39/i.test(reviewAfter),
 categories:categorySlugs.length,products:new Set(productSlugs).size,assetsDirectory:path.relative(target,outAssets)||'.',output:target};
fs.writeFileSync(path.join(target,'STAGE4B-UPGRADE-REPORT.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
