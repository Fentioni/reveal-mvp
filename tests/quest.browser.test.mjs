import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium, webkit} from 'playwright';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const mimetypes = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.webp':'image/webp'};
let server;
let browser;
let base;
const browserEngine = process.env.QUEST_BROWSER==='webkit' ? 'webkit' : 'chromium';
const outputDir = resolve(root,'test-output',browserEngine);

async function start() {
  server=createServer(async(req,res)=>{
    const raw = new URL(req.url, 'http://127.0.0.1');
    const path=raw.pathname==='/'?'/index.html':raw.pathname;
    if (!/^\/(quest\.html|quest\.js|quest-assets\/(letter|suitcase|passport|map|ticket|finale)\.webp|index\.html)$/.test(path)){
      res.writeHead(404);res.end('Not found');return;
    }
    try {
      const body=await readFile(resolve(root,'.'+path));
      res.writeHead(200,{'content-type':mimetypes[extname(path)]||'application/octet-stream'});
      res.end(body);
    } catch {
      res.writeHead(404);res.end('Missing asset');
    }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base='http://127.0.0.1:'+server.address().port;
  browser=await (browserEngine==='webkit'?webkit:chromium).launch({headless:true});
  await mkdir(outputDir,{recursive:true});
}
async function cleanup() {
  await browser?.close();
  if(server)await new Promise(resolve=>server.close(resolve));
}

test('portrait mobile Quest: every cinematic chapter is playable without overflow', {timeout:120000}, async()=>{
  await start();
  try {
    const page=await browser.newPage({
      viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'
    });
    const errs=[];
    page.on('pageerror',err=>errs.push(err.message));
    await page.goto(base+'/quest.html',{waitUntil:'networkidle'});
    await page.waitForTimeout(300);
    if(!await page.locator('#creatorForm').count()) {
      throw new Error('Creator did not render. Browser errors: '+JSON.stringify(errs)+'; page text: '+(await page.locator('body').innerText()).slice(0,500));
    }
    await page.locator('#creatorForm').waitFor({timeout:5000});
    assert.equal(await page.locator('#create').isVisible(),true);
    assert.equal(await page.locator('h1').first().innerText(),'The Missing Itinerary');
    await page.getByRole('button',{name:'Play the sample adventure'}).click();
    await page.getByRole('button',{name:/Begin the adventure/}).click();

    async function chapter(i,title){
      await page.locator('.quest h2').filter({hasText:title}).waitFor({timeout:10000});
      assert.equal(await page.locator('.quest h2').innerText(),title);
      const w=await page.evaluate(()=>document.documentElement.scrollWidth);
      assert.ok(w<=393,'Chapter '+i+' has horizontal overflow: '+w+'px');
      const scene=page.locator('.scene');
      assert.equal(await scene.count(),1);
      const ok=await scene.evaluate(el=>getComputedStyle(el).backgroundImage.includes('.webp'));
      assert.equal(ok,true,'Chapter '+i+' lacks cinematic art');
      await page.screenshot({path:resolve(outputDir,'chapter-'+i+'.png'),fullPage:true,animations:'disabled'});
    }

    await chapter(1,'The Mysterious Letter');
    await page.getByRole('button',{name:/Need a hint/i}).click();
    await page.getByText('Look for the object that helps travellers find north.').waitFor();
    await page.getByRole('button',{name:'A compass'}).click();

    await chapter(2,'The Locked Suitcase');
    for(let i=0;i<4;i++)await page.getByRole('button',{name:'Increase digit 1'}).click();
    for(let i=0;i<2;i++)await page.getByRole('button',{name:'Increase digit 2'}).click();
    for(let i=0;i<7;i++)await page.getByRole('button',{name:'Increase digit 3'}).click();
    await page.getByRole('button',{name:'Unlock suitcase'}).click();

    await chapter(3,'The Passport Mystery');
    for(const place of ['Rome · 08 Apr','Barcelona · 12 Apr','Lisbon · 19 Apr'])await page.getByRole('button',{name:place}).click();
    await page.getByRole('button',{name:'Check sequence'}).click();

    await chapter(4,'The Secret Map');
    for(const place of ['Lighthouse','Forest','Mountain peak'])await page.getByRole('button',{name:place}).click();
    await page.getByRole('button',{name:'Check sequence'}).click();

    await chapter(5,'The Missing Itinerary');
    for(const piece of ['Route line','Flight symbol','Gold seal'])await page.getByRole('button',{name:piece}).click();
    await page.getByRole('button',{name:'Check sequence'}).click();

    await page.getByText('Your personalised surprise will appear here after payment').waitFor();
    assert.ok(await page.locator('.scene.finale').count());
    await page.screenshot({path:resolve(outputDir,'finale.png'),fullPage:true,animations:'disabled'});
    await page.getByRole('button',{name:'Return to your editor'}).click();
    assert.equal(await page.locator('#creatorForm').isVisible(),true);
    assert.deepEqual(errs,[]);
    await page.close();
  } finally {await cleanup();}
});
