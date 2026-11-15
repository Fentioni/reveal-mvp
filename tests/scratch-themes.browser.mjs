import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from 'playwright';
import {SCRATCH_THEMES} from '../public/scratch-themes.js';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)),'public');
const browserType=process.env.SCRATCH_BROWSER==='webkit'?webkit:chromium;
const browserName=process.env.SCRATCH_BROWSER==='webkit'?'webkit':'chromium';
const output=resolve(fileURLToPath(new URL('..',import.meta.url)),'test-output','scratch-'+browserName);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp'};
const recipient={
 success:true,
 scratchSurface:{theme:'magical',style:'classic',foil:'gold',variant:'ticket',hasImage:false},
 audio:{enabled:false},
 reveal:{recipient:'Chloe',sender:'Michael',eventName:'A surprise to remember',
  eventDate:'2027-03-12',eventTime:'19:00',venue:'The Grand Hall',admit:'Two guests',
  personalMessage:'Something wonderful awaits',ticketUrl:null,hasEventImage:false}
};
async function startServer(){
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const themeId=url.pathname.match(/^\/r\/theme-([a-z-]+)\/scratch-data$/)?.[1];
  const selectedTheme=SCRATCH_THEMES.find(theme=>theme.id===themeId);
  if(url.pathname==='/r/theme-test/scratch-data'||selectedTheme){
   res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
   res.end(JSON.stringify({...recipient,scratchSurface:{...recipient.scratchSurface,
    theme:selectedTheme?.id||recipient.scratchSurface.theme}}));return;
  }
  const file=url.pathname==='/legacy-create'?'/legacy-create.html'
   :(url.pathname==='/r/theme-test'||SCRATCH_THEMES.some(t=>url.pathname==='/r/theme-'+t.id))?'/recipient-scratch.html'
   :url.pathname;
  if(!/^\/(legacy-create\.html|recipient-scratch\.html|scratch-themes\.css|scratch-themes\.js|scratchcard\.js|scratch-audio\.js|scratch-recipient-fields\.js)$/.test(file)){
   res.writeHead(404);res.end('Not found');return;
  }
  try{
   const buf=await readFile(resolve(root,file.slice(1)));
   res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream'});
   res.end(buf);
  }catch{
   res.writeHead(404);res.end('Not found');
  }
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return{server,base:'http://127.0.0.1:'+server.address().port};
}
test('all 13 scratch themes show creator previews and preserve foil/design choices on phone and desktop',{timeout:110000},async()=>{
 const {server,base}=await startServer();
 const browser=await browserType.launch({headless:true});
 await mkdir(output,{recursive:true});
 try{
  for(const size of [{name:'mobile',width:390,height:844},{name:'desktop',width:1380,height:900}]){
   const page=await browser.newPage({viewport:{width:size.width,height:size.height},deviceScaleFactor:1,reducedMotion:'reduce'});
   const errors=[];
   page.on('pageerror',err=>errors.push(err.message));
   await page.goto(base+'/legacy-create',{waitUntil:'networkidle'});
   await page.locator('.scratch-theme-option[data-scratch-theme]').first().waitFor();
   assert.equal(await page.locator('.scratch-theme-option[data-scratch-theme]').count(),13);
   assert.equal(await page.locator('[data-scratch-foil]').count(),4);
   assert.equal(await page.locator('[data-scratch-style]').count(),6);
   assert.equal(await page.locator('body').getAttribute('data-scratch-theme'),'luxury-elegant');
   assert.equal(await page.locator('.scratch-theme-option[data-scratch-theme="luxury-elegant"]').getAttribute('aria-pressed'),'true');
   const initial=await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundImage);
   await page.locator('.scratch-theme-option[data-scratch-theme="magical"]').click();
   assert.equal(await page.locator('body').getAttribute('data-scratch-theme'),'magical');
   assert.equal(await page.locator('.scratch-theme-option[data-scratch-theme="magical"]').getAttribute('aria-pressed'),'true');
   const magical=await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundImage);
   assert.notEqual(initial,magical,'A new theme must visibly change the screen background');
   await page.screenshot({path:resolve(output,size.name+'-creator-magical.png'),fullPage:true});
   await page.locator('[data-scratch-foil="rose"]').click();
   await page.locator('[data-scratch-style="theatre"]').click();
   await page.locator('.scratch-theme-option[data-scratch-theme="travel"]').click();
   assert.equal(await page.locator('#scratchFoil').inputValue(),'rose');
   assert.equal(await page.locator('#scratchStyle').inputValue(),'theatre');
   assert.equal(await page.locator('.scratch-theme-option[data-scratch-theme="travel"]').getAttribute('aria-pressed'),'true');
   const themeBody=await page.locator('body').evaluate(el=>({
    bg:getComputedStyle(el).backgroundImage,
    theme:el.dataset.scratchTheme
   }));
   assert.notEqual(themeBody.bg,magical);
   assert.equal(themeBody.theme,'travel');
   // Test every theme with the SAME retained foil and artwork, not just a handful
   // of selected screenshots. This must catch themes that repaint only the page.
   const backgrounds=new Set();
   const covers=new Set();
   for(const theme of SCRATCH_THEMES){
    await page.locator('.scratch-theme-option[data-scratch-theme="'+theme.id+'"]').click();
    assert.equal(await page.locator('body').getAttribute('data-scratch-theme'),theme.id);
    assert.equal(await page.locator('.scratch-theme-option[data-scratch-theme="'+theme.id+'"]').getAttribute('aria-pressed'),'true');
    backgrounds.add(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundImage));
    covers.add(await page.locator('#scratchSurfacePreview').evaluate(el=>el.toDataURL('image/png')));
    assert.equal(await page.locator('#scratchFoil').inputValue(),'rose');
    assert.equal(await page.locator('#scratchStyle').inputValue(),'theatre');
    if(size.name==='mobile')await page.screenshot({
     path:resolve(output,'mobile-theme-'+theme.id+'.png'),fullPage:true
    });
   }
   assert.equal(backgrounds.size,13,'Each theme must produce its own screen backdrop');
   assert.equal(covers.size,13,'Each theme must repaint the scratch surface itself');
   const foil=await page.locator('#scratchSurfacePreview').evaluate(canvas=>{
    const pixel=canvas.getContext('2d').getImageData(18,18,1,1).data;
    return [...pixel];
   });
   assert.equal(foil.length,4);
   assert.ok(foil[3]>0,'Preview must contain an actual painted theme surface');
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
   assert.ok(overflow<=2,'The '+size.name+' creator must not overflow horizontally: '+overflow);
   await page.screenshot({path:resolve(output,size.name+'-creator-travel.png'),fullPage:true});
   assert.deepEqual(errors,[]);
   await page.close();
  }
 }finally{await browser.close();await new Promise(done=>server.close(done));}
});
test('paid scratch recipient screen and foil Canvas reflect saved theme while keeping details concealed under foil',{timeout:50000},async()=>{
 const {server,base}=await startServer();
 const browser=await browserType.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,reducedMotion:'reduce'});
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto(base+'/r/theme-test',{waitUntil:'networkidle'});
  await page.locator('#card.foil-ready').waitFor();
  assert.equal(await page.locator('body').getAttribute('data-scratch-theme'),'magical');
  assert.match(await page.locator('.eyebrow').textContent(),/Magical reveal/);
  assert.match(await page.locator('#name').textContent(),/Chloe/);
  assert.equal(await page.locator('#card').isVisible(),true);
  const colors=await page.locator('#foilCanvas').evaluate(el=>[...el.getContext('2d').getImageData(18,18,1,1).data]);
  assert.ok(colors[3]>0);
  assert.equal(await page.locator('#progress').getAttribute('value'),'0');
  await page.screenshot({path:resolve(output,'recipient-magical-foil.png'),fullPage:true});
  // Simulate each paid recipient with the selected theme returned by the API.
  // The concealed foil must be painted and must differ across all 13 themes.
  const recipientBackgrounds=new Set();
  const recipientFoils=new Set();
  for(const theme of SCRATCH_THEMES){
   await page.goto(base+'/r/theme-'+theme.id,{waitUntil:'networkidle'});
   await page.locator('#card.foil-ready').waitFor();
   assert.equal(await page.locator('body').getAttribute('data-scratch-theme'),theme.id);
   assert.equal(await page.locator('#progress').getAttribute('value'),'0');
   assert.match(await page.locator('.eyebrow').textContent(),new RegExp(theme.label.replace(/[.*+?^${}()|[\]\\]/g,'\\  await page.screenshot({path:resolve(output,'recipient-magical-foil.png'),fullPage:true});
  assert.deepEqual(errors,[]);')+' reveal'));
   recipientBackgrounds.add(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundImage));
   recipientFoils.add(await page.locator('#foilCanvas').evaluate(el=>el.toDataURL('image/png')));
   assert.equal(await page.locator('#card').isVisible(),true);
  }
  assert.equal(recipientBackgrounds.size,13,'Paid recipient backgrounds must vary by saved theme');
  assert.equal(recipientFoils.size,13,'Paid recipient scratch foils must vary by saved theme');
  assert.deepEqual(errors,[]);
  await page.close();
 }finally{await browser.close();await new Promise(done=>server.close(done));}
});
