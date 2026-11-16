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
   const foilName=path.match(/^\/r\/concert-foil-(gold|silver|midnight|rose)\/scratch-data$/)?.[1];
   if(foilName){
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
    res.end(JSON.stringify({...sample,scratchSurface:{
      style:'concert',foil:foilName,variant:'concert',hasImage:false}}));
    return;
   }
   if(path==='/r/concert-qr/scratch-data'){
     res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
     res.end(JSON.stringify({...sample,scratchSurface:{
       style:'concert',foil:'rose',variant:'concert',hasImage:false,
       ticketTemplate:'rounded-stub',revealTheme:'backstage',linkMode:'qr'
     },reveal:{...sample.reveal,ticketUrl:'https://example.org/concert?t=42'}}));
     return;
   }
   const design=path.match(/^\/concert-reveal-art\/(classic|concert-lights|festival|backstage)\.svg$/)?.[1];
   if(design){
     res.writeHead(200,{'content-type':'image/svg+xml'});
     res.end(await readFile(resolve(root,'concert-reveal-art',design+'.svg')));
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
    :path.match(/^\/r\/(?:artwork-[a-z-]+|concert-foil-(?:gold|silver|midnight|rose)|concert-qr)$/)?'/recipient-scratch.html'
   :path;
  if(!/^\/(?:legacy-create\.html|recipient-scratch\.html|scratch-artwork-catalogue\.js|concert-ticket-options\.js|concert-ticket-fields\.js|concert-live-preview\.js|qr\.js|scratchcard\.js|scratch-themes\.js|scratch-theme-art\.js|scratch-audio\.js|scratch-recipient-fields\.js)$/.test(file)){
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
test('Concert Ticket exclusively shows four foil finishes with no redundant headings or scratch-face watermarks',
 {timeout:95000},async()=>{
 const {server,base}=await startServer();
 const browser=await browserType.launch({headless:true});
 try{
  for(const size of [{name:'mobile',width:390,height:844},{name:'desktop',width:1380,height:900}]){
   const page=await browser.newPage({viewport:size,deviceScaleFactor:1,reducedMotion:'reduce'});
   const errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto(base+'/legacy-create?variant=concert',{waitUntil:'networkidle'});
   await page.locator('#scratchFoilGrid:visible').waitFor();
   assert.equal(await page.locator('#scratchArtworkSection:visible').count(),0);
   assert.match(await page.locator('#imageUploadHelp').textContent(),/appears after scratching/);
   assert.equal(await page.locator('#surfaceHeading').count(),0);
   assert.equal(await page.locator('#surfaceDescription').count(),0);
   assert.equal(await page.locator('#scratchFoilLabel:visible').count(),1);
   assert.equal((await page.locator('#scratchFoilLabel').textContent()).trim(),'2. Scratch colour');
   assert.equal(await page.locator('#scratchFoilGrid [data-scratch-foil]:visible').count(),4);
   assert.equal(await page.locator('#scratchArtGrid').count(),0,'Old scratch artwork choices must stay removed');
   assert.equal(await page.locator('.concert-template-option').count(),4);
   assert.equal(await page.locator('.concert-theme-option').count(),4);
   assert.equal(await page.locator('#concertLinkModeField:visible').count(),1);
   assert.equal(await page.locator('#concertEventUploadDock:visible').count(),1);
   assert.equal(await page.locator('#image').count(),1);
   assert.equal(await page.locator('#scratchArtwork').getAttribute('required'),null);
   const silhouettes=new Set(),shapeCanvases=new Set();
   for(const template of ['side-perforations','stamp-edge','classic-notches','rounded-stub']){
     await page.locator('.concert-template-option[data-value="'+template+'"]').click();
     assert.equal(await page.locator('.concert-template-option[data-value="'+template+'"]').getAttribute('aria-pressed'),'true');
     silhouettes.add(await page.locator('.scratch-static-frame').evaluate(el=>getComputedStyle(el).clipPath));
     shapeCanvases.add(await page.locator('#scratchSurfacePreview').evaluate(canvas=>canvas.toDataURL('image/png')));
   }
   assert.equal(silhouettes.size,4,'Four distinct ticket cutout shapes must be applied to the preview');
   assert.equal(shapeCanvases.size,4,'Changing templates must redraw the scratch surface shape');
   for(const theme of ['classic','concert-lights','festival','backstage']){
     await page.locator('.concert-theme-option[data-value="'+theme+'"]').click();
     assert.equal(await page.locator('.concert-theme-option[data-value="'+theme+'"]').getAttribute('aria-pressed'),'true');
   }
   await page.locator('#concertLinkMode').selectOption('qr');
   assert.equal(await page.locator('#concertLinkMode').inputValue(),'qr');
   const paintings=new Set();
   const centreColours=new Set();
   for(const foil of ['gold','silver','midnight','rose']){
    await page.locator('[data-scratch-foil="'+foil+'"]').click();
    await page.waitForFunction(id=>document.querySelector('#scratchFoil').value===id,foil);
    const centre=await page.locator('#scratchSurfacePreview').evaluate(canvas=>{
      const context=canvas.getContext('2d',{willReadFrequently:true});
      return [...context.getImageData(Math.floor(canvas.width*.43),Math.floor(canvas.height*.54),1,1).data].slice(0,3);
    });
    centreColours.add(centre.join(','));
    paintings.add(await page.locator('#scratchSurfacePreview').evaluate(canvas=>canvas.toDataURL('image/png')));
    await page.screenshot({path:resolve(output,size.name+'-concert-'+foil+'.png'),fullPage:true});
   }
   assert.equal(paintings.size,4,'Each concert foil option must repaint the ticket');
   assert.equal(centreColours.size,4,'The middle of the concert ticket must change colour, not just its border');
   const ratio=await page.locator('#scratchSurfacePreview').evaluate(node=>{
    const bounds=node.getBoundingClientRect();return bounds.width/bounds.height;
   });
   assert.ok(Math.abs(ratio-2.15)<.15,'Concert preview stays landscape');
   assert.deepEqual(errors,[]);
   await page.screenshot({path:resolve(output,size.name+'-concert-foil-options.png'),fullPage:true});
   await page.close();
  }
 }finally{await browser.close();await new Promise(done=>server.close(done));}
});
test('concert purchaser can switch between scratch cover and a fully personalised live revealed-ticket preview',
 {timeout:95000},async()=>{
 const {server,base}=await startServer();
 const browser=await browserType.launch({headless:true});
 try{
  for(const size of [{name:'mobile',width:390,height:844},{name:'desktop',width:1380,height:900}]){
   const page=await browser.newPage({viewport:size,deviceScaleFactor:1,reducedMotion:'reduce'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/legacy-create?variant=concert',{waitUntil:'networkidle'});
   await page.locator('#concertTemplateChoices .concert-template-option:enabled').first().waitFor();
   const tabSelector=size.name==='mobile'?'#concertPreviewTabsMobile':'#concertPreviewTabsDesktop';
   assert.equal(await page.locator(tabSelector+':visible').count(),1);
   await page.locator('#eventName').fill('Live Music at the Hall');
   await page.locator('#eventSubtitle').fill('A very special evening');
   await page.locator('#supportAct').fill('The Openers');
   await page.locator('#venue').fill('The Grand Hall');
   await page.locator('#venueAddress').fill('London, England');
   await page.locator('#section').fill('Balcony');
   await page.locator('#row').fill('G');
   await page.locator('#seat').fill('18');
   await page.locator('#gate').fill('A');
   await page.locator('#ticketPrice').fill('£25');
   await page.locator('#ticketNumber').fill('T-123');
   await page.locator('#eventDate').fill('2027-03-20');
   await page.locator('#eventTime').fill('19:30');
   await page.locator('#ticketUrl').fill('https://example.org/tickets/123');
   await page.locator('#concertLinkMode').selectOption('qr');
   await page.locator('.concert-template-option[data-value="stamp-edge"]').click();
   await page.locator('.concert-theme-option[data-value="concert-lights"]').click();
   assert.equal(await page.locator('body').getAttribute('data-concert-preview'),'revealed');
   assert.equal(await page.locator('#concertRevealedPreviewFrame:visible').count(),1);
   assert.equal(await page.locator('.scratch-static-frame:visible').count(),0);
   assert.equal((await page.locator('#concertLiveEvent').textContent()).trim(),'Live Music at the Hall');
   const details=await page.locator('#concertLiveFields').textContent();
   for(const value of ['The Grand Hall','London, England','Balcony','G','18','A','£25']){
    assert.ok(details.includes(value),'Revealed ticket must include '+value);
   }
   assert.equal((await page.locator('#concertLiveSubtitle').textContent()).trim(),'A very special evening');
   assert.match(await page.locator('#concertLiveSupport').textContent(),/The Openers/);
   assert.match(await page.locator('#concertLiveTicketNumber').textContent(),/T-123/);
   assert.equal(await page.locator('#concertLiveQr svg').count(),1);
   const background=await page.locator('#concertRevealedPreviewFrame').evaluate(e=>getComputedStyle(e).backgroundImage);
   assert.ok(background.includes('concert-lights.svg'));
   await page.screenshot({path:resolve(output,size.name+'-live-revealed-ticket.png'),fullPage:true});
   await page.locator(tabSelector+' [data-preview-mode="cover"]').click();
   assert.equal(await page.locator('.scratch-static-frame:visible').count(),1);
   assert.equal(await page.locator('#concertRevealedPreviewFrame:visible').count(),0);
   await page.locator('[data-scratch-foil="rose"]').click();
   assert.equal(await page.locator('#scratchFoil').inputValue(),'rose');
   await page.screenshot({path:resolve(output,size.name+'-scratch-cover-after-reveal.png'),fullPage:true});
   assert.deepEqual(errors,[]);
   await page.close();
  }
 }finally{await browser.close();await new Promise(done=>server.close(done));}
});
test('paid concert recipient sees four full-surface foil colours, even on narrow phones',
 {timeout:95000},async()=>{
 const {server,base}=await startServer();
 const browser=await browserType.launch({headless:true});
 try{
  for(const size of [{name:'mobile',width:390,height:844},{name:'desktop',width:1380,height:900}]){
   const page=await browser.newPage({viewport:size,deviceScaleFactor:1,reducedMotion:'reduce'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const pixels=new Set();
   for(const foil of ['gold','silver','midnight','rose']){
    await page.goto(base+'/r/concert-foil-'+foil,{waitUntil:'networkidle'});
    await page.locator('#card.foil-ready').waitFor();
    assert.equal(await page.locator('body').getAttribute('data-ticket-variant'),'concert');
    assert.equal((await page.locator('.eyebrow').textContent()).trim(),'Concert ticket');
    assert.equal(await page.locator('#progress').getAttribute('value'),'0');
    const pixel=await page.locator('#foilCanvas').evaluate(canvas=>{
      const context=canvas.getContext('2d',{willReadFrequently:true});
      return [...context.getImageData(Math.floor(canvas.width*.42),Math.floor(canvas.height*.55),1,1).data].slice(0,3);
    });
    pixels.add(pixel.join(','));
   }
   assert.equal(pixels.size,4,'Paid recipient ticket must change colour across whole scratch foil');
   assert.deepEqual(errors,[]);
   await page.screenshot({path:resolve(output,size.name+'-concert-recipient-rose.png'),fullPage:true});
   await page.close();
  }
 }finally{await browser.close();await new Promise(done=>server.close(done));}
});
test('paid concert QR is generated from the chosen URL but is hidden until scratching',
 {timeout:90000},async()=>{
 const {server,base}=await startServer();
 const browser=await browserType.launch({headless:true});
 try{
   const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/r/concert-qr',{waitUntil:'networkidle'});
   await page.locator('#card.foil-ready').waitFor();
   assert.equal(await page.locator('#card').getAttribute('data-concert-theme'),'backstage');
   assert.equal(await page.locator('#concertQrRow svg').count(),1,'Generate a real local SVG QR code');
   assert.equal(await page.locator('#bookingRow:visible').count(),0,'Link mode is mutually exclusive with QR mode');
   assert.equal(await page.locator('#bookingAction:visible').count(),0);
   assert.equal(await page.locator('#concertQrRow').evaluate(e=>getComputedStyle(e).visibility),'hidden');
   assert.equal(await page.locator('body').getAttribute('data-ticket-variant'),'concert');
   assert.deepEqual(errors,[]);
   await page.screenshot({path:resolve(output,'mobile-concert-qr-covered.png'),fullPage:true});
   await page.close();
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
