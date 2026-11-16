import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from 'playwright';
import {SCRATCH_ARTWORKS,DEFAULT_SCRATCH_ARTWORK} from '../public/scratch-artwork-catalogue.js';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)),'public');
const browserType=process.env.SCRATCH_BROWSER==='webkit'?webkit:chromium;
const browserName=process.env.SCRATCH_BROWSER==='webkit'?'webkit':'chromium';
const output=resolve(fileURLToPath(new URL('..',import.meta.url)),'test-output','scratch-'+browserName);
const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const sample={
 success:true,
 scratchSurface:{artworkId:DEFAULT_SCRATCH_ARTWORK,style:'classic',foil:'gold',variant:'ticket',hasImage:false},
 audio:{enabled:false},
 reveal:{recipient:'Chloe',sender:'Michael',eventName:'A surprise to remember',
  eventDate:'2027-03-12',eventTime:'19:00',venue:'The Grand Hall',admit:'Two guests',
  personalMessage:'Something wonderful awaits',ticketUrl:null,hasEventImage:false}
};
async function startServer(){
 const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  const jpg=SCRATCH_ARTWORKS.find(item=>path===item.src);
  if(jpg){
   // Synthetic artwork is deliberate: browser routing/Canvas tests must not
   // pretend that the user's actual JPEG files have already been uploaded.
   const n=SCRATCH_ARTWORKS.indexOf(jpg);
   const color='#'+((n*423721+0x244466)&0xffffff).toString(16).padStart(6,'0');
   res.writeHead(200,{'content-type':'image/svg+xml','cache-control':'no-store'});
   res.end('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="'+color+'"/></svg>');
   return;
  }
  const slug=path.match(/^\/r\/artwork-([a-z-]+)\/scratch-data$/)?.[1];
  const art=SCRATCH_ARTWORKS.find(item=>item.id===slug);
  if(art){
   res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
   res.end(JSON.stringify({...sample,scratchSurface:{...sample.scratchSurface,artworkId:art.id}}));
   return;
  }
  const file=path==='/legacy-create'?'/legacy-create.html'
   :path.match(/^\/r\/artwork-[a-z-]+$/)?'/recipient-scratch.html'
   :path;
  if(!/^\/(?:legacy-create\.html|recipient-scratch\.html|scratch-artwork-catalogue\.js|scratchcard\.js|scratch-themes\.js|scratch-theme-art\.js|scratch-audio\.js|scratch-recipient-fields\.js)$/.test(file)){
   res.writeHead(404);res.end('Not found');return;
  }
  try{
   const buf=await readFile(resolve(root,file.slice(1)));
   res.writeHead(200,{'content-type':type[extname(file)]||'application/octet-stream'});
   res.end(buf);
  }catch{
   res.writeHead(404);res.end('Not found');
  }
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return{server,base:'http://127.0.0.1:'+server.address().port};
}
test('creator shows only the 20-artwork dropdown without the retired foil section on phone or desktop',
 {timeout:100000},async()=>{
 const {server,base}=await startServer();
 const browser=await browserType.launch({headless:true});
 await mkdir(output,{recursive:true});
 try{
  for(const size of [{name:'mobile',width:390,height:844},{name:'desktop',width:1380,height:900}]){
   const page=await browser.newPage({viewport:size,deviceScaleFactor:1,reducedMotion:'reduce'});
   const errors=[];
   page.on('pageerror',err=>errors.push(err.message));
   await page.goto(base+'/legacy-create',{waitUntil:'networkidle'});
   await page.locator('#scratchArtwork:enabled').waitFor();
   assert.equal(await page.locator('#scratchArtwork option').count(),20);
   assert.equal(await page.locator('.scratch-theme-option').count(),0);
   assert.equal(await page.locator('[data-scratch-foil]:visible').count(),0);
   assert.equal(await page.locator('#surfaceHeading:visible').count(),0);
   assert.equal(await page.locator('#surfaceDescription:visible').count(),0);
   assert.equal(await page.locator('#scratchFoilLabel:visible').count(),0);
   assert.equal(await page.locator('#scratchFoilGrid:visible').count(),0);
   assert.equal(await page.locator('#image').count(),1);
   assert.equal(await page.locator('#scratchArtwork').inputValue(),DEFAULT_SCRATCH_ARTWORK);
   assert.equal(await page.locator('#scratchFoil').inputValue(),'gold');
   const paintings=new Set();
   for(const art of SCRATCH_ARTWORKS){
    await page.locator('#scratchArtwork').selectOption(art.id);
    await page.waitForFunction(id=>document.querySelector('#scratchArtwork')?.value===id,art.id);
    await page.waitForTimeout(75);
    assert.equal(await page.locator('#scratchFoil').inputValue(),'gold');
    paintings.add(await page.locator('#scratchSurfacePreview').evaluate(canvas=>canvas.toDataURL('image/png')));
   }
   assert.equal(paintings.size,20,'Each approved artwork must actually repaint the surface Canvas');
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
   assert.ok(overflow<=2,'No horizontal overflow on '+size.name+': '+overflow);
   assert.deepEqual(errors,[]);
   await page.screenshot({path:resolve(output,size.name+'-final-20-dropdown.png'),fullPage:true});
   await page.close();
  }
 }finally{await browser.close();await new Promise(done=>server.close(done));}
});
test('paid recipient uses selected artwork as scratch foil while hiding surprise until scratched',
 {timeout:90000},async()=>{
 const {server,base}=await startServer();
 const browser=await browserType.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const paintings=new Set();
  for(const art of SCRATCH_ARTWORKS){
   await page.goto(base+'/r/artwork-'+art.id,{waitUntil:'networkidle'});
   await page.locator('#card.foil-ready').waitFor();
   assert.equal(await page.locator('#card').isVisible(),true);
   assert.equal(await page.locator('#progress').getAttribute('value'),'0');
   assert.equal((await page.locator('.eyebrow').textContent()).trim(),'A special scratch reveal');
   paintings.add(await page.locator('#foilCanvas').evaluate(canvas=>canvas.toDataURL('image/png')));
  }
  assert.equal(paintings.size,20,'The paid recipient must see each saved artwork image');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:resolve(output,'recipient-approved-artwork.png'),fullPage:true});
  await page.close();
 }finally{await browser.close();await new Promise(done=>server.close(done));}
});
