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
       ticketTemplate:'rounded-stub',revealTheme:'backstage',linkMode:'qr',
       ticketDetails:{ticketNumber:'T-123',section:'Balcony',row:'G',seat:'18',gate:'A2',venueAddress:'London, England'}
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
  const file=path==='/reveal'?'/reveal.html':path==='/legacy-create'?'/legacy-create.html'
    :path.match(/^\/r\/(?:artwork-[a-z-]+|concert-foil-(?:gold|silver|midnight|rose)|concert-qr)$/)?'/recipient-scratch.html'
   :path;
  if(!file.startsWith('/post-scratch-')&&!/^\/(?:legacy-create\.html|reveal\.html|recipient-scratch\.html|scratch-recipient-face\.js|scratch-recipient-face\.css|scratch-owner-preview\.js|scratch-themes\.css|scratch-artwork-catalogue\.js|concert-ticket-options\.js|concert-ticket-fields\.js|concert-live-preview\.js|concert-ticket-premium\.css|concert-layout-presets\.css|concert-reference-renderer\.js|concert-reference-renderer\.css|qr\.js|scratchcard\.js|scratch-themes\.js|scratch-theme-art\.js|scratch-audio\.js|scratch-recipient-fields\.js)$/.test(file)){
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
test('actual private Scratch Ticket review matches paid card markup, geometry and artwork with no active scratch controls',
 {timeout:120000},async()=>{
 const {server,base}=await startServer();
 const browser=await browserType.launch({headless:true});
 const staging='https://reveal-stage4b-test.michael-fenton9.workers.dev';
 try{
  await mkdir(output,{recursive:true});
  for(const size of [{name:'mobile',width:390,height:844},{name:'desktop',width:1380,height:900}]){
   for(const custom of [false,true]){
    const owner=await browser.newPage({viewport:size,deviceScaleFactor:1,reducedMotion:'reduce'});
    const recipient=await browser.newPage({viewport:size,deviceScaleFactor:1,reducedMotion:'reduce'});
    const errors=[];owner.on('pageerror',e=>errors.push(e.message));recipient.on('pageerror',e=>errors.push(e.message));
    const details={...sample.reveal,eventName:'Jesus Christ Superstar',ticketUrl:'https://example.org/tickets',hasEventImage:true};
    const surface={...sample.scratchSurface,theme:'luxury-elegant',style:custom?'custom':'classic',hasImage:custom,artworkId:custom?null:DEFAULT_SCRATCH_ARTWORK};
    // Valid synthetic PNG bytes, used for both authenticated owner and paid recipient.
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
    await owner.addInitScript(()=>localStorage.setItem('reveal_edit_private-draft','owner-edit-token'));
    const ownerRequests=[];
    await owner.route(staging+'/**',async route=>{
      const u=new URL(route.request().url()),p=u.pathname;
      if(p.startsWith('/api/')){
        ownerRequests.push(p);
        assert.equal(route.request().headers()['x-edit-token'],'owner-edit-token');
        if(p==='/api/reveals/private-draft')return route.fulfill({json:{success:true,reveal:{...details,hasImage:true,status:'draft',id:'private-draft'}}});
        if(p==='/api/reveals/private-draft/quiz'||p==='/api/reveals/private-draft/gender')return route.fulfill({status:404});
        if(p==='/api/reveals/private-draft/scratch-surface')return route.fulfill({json:{success:true,surface,audio:{enabled:false}}});
        if(p.endsWith('/image'))return route.fulfill({contentType:'image/png',body:png});
      }
      assert.ok(!p.startsWith('/r/'),'Private review must not request a public recipient endpoint');
      return route.fulfill({response:await route.fetch({url:base+p+u.search})});
    });
    await recipient.route('**/r/artwork-*/scratch-data',route=>route.fulfill({json:{...sample,reveal:details,scratchSurface:surface}}));
    await recipient.route('**/r/artwork-*/scratch-image',route=>route.fulfill({contentType:'image/png',body:png}));
    await recipient.route('**/r/artwork-*/scratch-cover',route=>route.fulfill({contentType:'image/png',body:png}));
    await owner.goto(staging+'/reveal?id=private-draft',{waitUntil:'domcontentloaded'});
    await owner.locator('#scratchActualReview:visible').waitFor({timeout:15000});
    await recipient.goto(base+'/r/artwork-'+DEFAULT_SCRATCH_ARTWORK,{waitUntil:'domcontentloaded'});
    await recipient.locator('#card.foil-ready:visible').waitFor({timeout:15000});
    await owner.locator('#scratchActualCovered canvas').evaluate(el=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
    const before=await owner.locator('#scratchActualCovered #card').evaluate(card=>{
      const face=card.querySelector('#underlay'),canvas=card.querySelector('canvas'),r=card.getBoundingClientRect();
      const c=canvas.getBoundingClientRect();return {width:r.width,height:r.height,canvasW:c.width,canvasH:c.height,paint:canvas.toDataURL(),visibility:getComputedStyle(face).visibility,pointer:getComputedStyle(canvas).pointerEvents};
    });
    const after=await owner.locator('#scratchActualRevealed #card').evaluate(card=>{
      const r=card.getBoundingClientRect();
      return {width:r.width,height:r.height,text:card.querySelector('#underlay').textContent,background:getComputedStyle(card.querySelector('.ticket-underlay')).backgroundImage};
    });
    const actual=await recipient.locator('#card').evaluate(card=>{
      const r=card.getBoundingClientRect(),canvas=card.querySelector('canvas');
      return {width:r.width,height:r.height,text:card.querySelector('#underlay').textContent,paint:canvas.toDataURL(),background:getComputedStyle(card.querySelector('.ticket-underlay')).backgroundImage};
    });
    assert.equal(await owner.locator('.review-shell:visible,#surfaceReview:visible').count(),0);
    assert.equal(await owner.locator('#scratchActualReview button, #scratchActualRevealed a[href]').count(),0);
    assert.equal(before.visibility,'hidden');
    assert.equal(before.pointer,'none');
    assert.equal(after.text,actual.text,'Exactly the same recipient markup and formatted fields');
    assert.equal(after.background,'none','Revealed design owns the background');
    assert.equal(after.background,actual.background,'Same post-scratch background treatment');
    for(const v of [before,after]){assert.ok(Math.abs(v.width-actual.width)<=1,'Same recipient width '+JSON.stringify({v:{width:v.width},actual:actual.width}));assert.ok(Math.abs(v.height-actual.height)<=1,'Same recipient height');}
    assert.equal(before.paint,actual.paint,'Identical artwork canvas, not a separate thumbnail');
    assert.equal(await owner.locator('#scratchActualRevealed svg image').count(),3);
    const foil=owner.locator('#scratchActualCovered canvas');
    await foil.evaluate(e=>{e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:50,clientY:50,pointerId:1}));e.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:70,clientY:70,pointerId:1}));});
    assert.equal(await foil.evaluate(c=>c.toDataURL()),before.paint,'Owner cannot scratch even through dispatched pointer events');
    assert.ok(ownerRequests.includes('/api/reveals/private-draft/scratch-surface'));
    assert.equal(ownerRequests.includes('/api/reveals/private-draft/scratch-surface/image'),custom);
    assert.deepEqual(errors,[]);
    await owner.locator('#scratchActualReview').screenshot({path:resolve(output,size.name+'-actual-review-'+(custom?'custom':'catalogue')+'.png')});
    await owner.close();await recipient.close();
   }
  }
 }finally{await browser.close();await new Promise(done=>server.close(done));}
});


test('Scratch Ticket creator upload, save, purchaser review and amend retain independent artwork and surprise image',
 {timeout:90000},async()=>{
 const {server,base}=await startServer();
 const browser=await browserType.launch({headless:true});
 const staging='https://reveal-stage4b-test.michael-fenton9.workers.dev';
 try{
   const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   let savedReveal,savedSurface,imageBytes;
   const art=SCRATCH_ARTWORKS[5].id;
   await page.route(staging+'/**',async route=>{
     const req=route.request(),u=new URL(req.url()),p=u.pathname;
     const json=result=>route.fulfill({json:result});
     if(p==='/api/reveals'&&req.method()==='POST'){
       const form=await new Response(req.postDataBuffer(),{headers:{'content-type':req.headers()['content-type']}}).formData();
       const photo=form.get('image');assert.ok(photo&&photo.size>0);
       imageBytes=Buffer.from(await photo.arrayBuffer());
       savedReveal={...Object.fromEntries([...form.entries()].filter(([k,v])=>typeof v==='string')),
         id:'image-check',revision:1,status:'draft',hasImage:true};
       return json({success:true,id:'image-check',revision:1,editToken:'owner-test-token'});
     }
     if(p==='/api/reveals/image-check/scratch-surface'&&req.method()==='PUT'){
       assert.equal(req.headers()['x-edit-token'],'owner-test-token');
       const form=await new Response(req.postDataBuffer(),{headers:{'content-type':req.headers()['content-type']}}).formData();
       assert.equal(form.get('style'),'classic');
       assert.equal(form.get('artworkId'),art);
       assert.equal(form.has('coverImage'),false,'Surprise image must not be saved as cover');
       savedSurface={...Object.fromEntries(form.entries()),hasImage:false,theme:'luxury-elegant'};
       return json({success:true,surface:savedSurface});
     }
     if(p==='/api/reveals/image-check')return json({success:true,reveal:savedReveal});
     if(p==='/api/reveals/image-check/scratch-surface')return json({success:true,surface:savedSurface,audio:{enabled:false}});
     if(p==='/api/reveals/image-check/image')return route.fulfill({contentType:'image/png',body:imageBytes});
     if(p.endsWith('/quiz')||p.endsWith('/gender'))return route.fulfill({status:404});
     assert.ok(!p.endsWith('/scratch-surface/image'),'Catalogue scratch cover must not retrieve a custom image');
     assert.ok(!p.startsWith('/r/'),'Purchaser must use owner-only endpoints');
     return route.fulfill({response:await route.fetch({url:base+p+u.search})});
   });
   await page.goto(staging+'/legacy-create?variant=ticket',{waitUntil:'networkidle'});
   await page.locator('#scratchArtwork:enabled').waitFor();
   await page.locator('#scratchArtwork').selectOption(art);
   await page.waitForFunction(id=>document.querySelector('#scratchActualCovered')?.dataset.renderedArtwork===id,art);
   await page.locator('#recipient').fill('Chloe');
   await page.locator('#sender').fill('Mick');
   await page.locator('#eventName').fill('Jesus Christ Superstar');
   await page.locator('#venue').fill('Theatre Royal, Drury Lane');
   await page.locator('#personalMessage').fill('A special night');
   const data=await page.evaluate(()=>{
     const c=document.createElement('canvas');c.width=800;c.height=1000;
     const ctx=c.getContext('2d');ctx.fillStyle='#f12b34';ctx.fillRect(0,0,800,1000);
     return c.toDataURL('image/png').split(',')[1];
   });
   await page.locator('#image').setInputFiles({name:'surprise.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});
   await page.waitForFunction(()=>Boolean(document.querySelector('#scratchActualRevealed')?.dataset.renderedImage));
   async function checkCurrent(){
     assert.equal(await page.locator('#scratchActualCovered').getAttribute('data-rendered-artwork'),art);
     assert.equal(await page.locator('#scratchActualCovered #underlay').evaluate(e=>getComputedStyle(e).visibility),'hidden');
     assert.equal(await page.locator('#scratchActualRevealed #underlay').evaluate(e=>getComputedStyle(e).visibility),'visible');
     assert.equal((await page.locator('#scratchActualRevealed [data-field=eventName] tspan').allTextContents()).join(' '),'JESUS CHRIST SUPERSTAR');
     assert.equal(await page.locator('#scratchActualRevealed svg image').nth(1).evaluate(e=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i.naturalWidth);i.src=e.getAttribute('href');})),800);
     assert.equal(await page.locator('#scratchActualRevealed canvas').count(),0);
     const px=await page.locator('#scratchActualCovered canvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data));
     assert.ok(px[3]===255&&!(px[0]>220&&px[1]<60&&px[2]<70),'Opaque catalogue cover must not show the red uploaded surprise photograph');
   }
   await checkCurrent();
   await page.locator('#reviewButton').click();
   await page.waitForURL('**/reveal?id=image-check',{timeout:15000});
   await page.locator('#scratchActualReview:visible').waitFor();
   await checkCurrent();
   assert.equal(await page.locator('.review-shell:visible,#surfaceReview:visible').count(),0);
   await page.locator('#editButton').click();
   await page.waitForURL('**/legacy-create?**',{timeout:15000});
   await page.locator('#scratchArtwork:enabled').waitFor();
   await page.waitForFunction(()=>Boolean(document.querySelector('#scratchActualRevealed')?.dataset.renderedImage));
   await checkCurrent();
   assert.equal(await page.locator('#scratchArtwork').inputValue(),art);
   assert.equal(await page.locator('.preview-details-toggle:visible').count(),0);
   assert.deepEqual(errors,[]);
   await page.close();
 }finally{await browser.close();await new Promise(done=>server.close(done));}
});

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
   assert.equal(await page.locator('.preview-details-toggle:visible,.scratch-static-frame:visible').count(),0);
   assert.equal(await page.locator('#scratchActualRevealed #card:visible').count(),1);
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
    await page.waitForFunction(id=>document.querySelector('#scratchActualCovered')?.dataset.renderedArtwork===id,art.id);
    paintings.add(await page.locator('#scratchActualCovered canvas').evaluate(canvas=>canvas.toDataURL('image/png')));
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
   const uploadHelp=await page.locator('#imageUploadHelp').textContent();
   for(const hint of ['JPEG','PNG','WebP','10 MB','400 × 240','1200 × 1600','cropped']){
     assert.ok(uploadHelp.includes(hint),'Upload guidance must include '+hint);
   }
   assert.equal(await page.locator('#eventDate').evaluate(e=>getComputedStyle(e).colorScheme),'dark');
   assert.equal(await page.locator('#eventTime').evaluate(e=>getComputedStyle(e).colorScheme),'dark');
   assert.equal(await page.locator('#surfaceHeading').count(),0);
   assert.equal(await page.locator('#surfaceDescription').count(),0);
   assert.equal(await page.locator('#scratchFoilLabel:visible').count(),1);
   assert.equal((await page.locator('#scratchFoilLabel').textContent()).trim(),'2. Scratch colour');
   assert.equal(await page.locator('#scratchFoilGrid [data-scratch-foil]:visible').count(),4);
   assert.equal(await page.locator('#scratchArtGrid').count(),0,'Old scratch artwork choices must stay removed');
   assert.equal(await page.locator('.concert-template-option').count(),4);
   assert.equal(await page.locator('.concert-template-option[data-value="rock-split"]').count(),0);
   assert.equal(await page.locator('.concert-theme-option, #concertThemeSection, #concertThemeChoices').count(),0,'Artwork selector must not exist');
   assert.equal(await page.locator('#concertLinkModeField, #concertLinkMode').count(),0,'No QR selector');
   assert.equal(await page.locator('#ticketUrl:visible').count(),1,'Optional clickable link remains');
   assert.equal(await page.locator('#concertEventUploadDock:visible').count(),1);
   assert.equal(await page.locator('#image').count(),1);
   assert.equal(await page.locator('#scratchArtwork').getAttribute('required'),null);
   assert.equal(await page.locator('#concertPreviewTabsDesktop:visible').count(),1);
   assert.equal(await page.locator('#concertPreviewTabsMobile:visible').count(),0);
   const layout=await page.evaluate(()=>{
     const rect=id=>{const x=document.querySelector(id).getBoundingClientRect();return {top:x.top,left:x.left,right:x.right,bottom:x.bottom,width:x.width};};
     return {preview:rect('.preview-column'),template:rect('#concertTemplateSection'),
       foil:rect('#scratchFoilGrid'),
       frame:rect('.scratch-static-frame')};
   });
   assert.ok(layout.preview.bottom <= layout.template.top+4,'Full-width ticket preview must appear above ticket selectors');
   assert.ok(layout.frame.width > (size.name==='desktop'?740:310),'Ticket must use substantially more width than before');
   assert.ok(layout.foil.top >= layout.template.bottom-1,'Scratch colours remain below designs');
   assert.ok(layout.template.width >= layout.frame.width*.85,'No empty artwork column');
   const silhouettes=new Set(),shapeCanvases=new Set();
   for(const template of ['premium-headliner','promo-poster','neon-tour','editorial-concert']){
     await page.locator('.concert-template-option[data-value="'+template+'"]').click();
     assert.equal(await page.locator('.concert-template-option[data-value="'+template+'"]').getAttribute('aria-pressed'),'true');
     silhouettes.add(await page.locator('.scratch-static-frame').evaluate(el=>getComputedStyle(el).clipPath));
     await page.locator('#concertPreviewTabsDesktop [data-preview-mode="cover"]').click();
     shapeCanvases.add(await page.locator('#scratchSurfacePreview').evaluate(canvas=>canvas.toDataURL('image/png')));
   }
   assert.equal(silhouettes.size,1,'Four source references have a common clean rectangular outer edge');
   // Canvas paint timestamps can differ; shape is asserted through the computed clip path above.
   const paintings=new Set();
   const centreColours=new Set();
   const visibleGradients=new Set();
   for(const foil of ['gold','silver','midnight','rose']){
    await page.locator('[data-scratch-foil="'+foil+'"]').click();
    await page.waitForFunction(id=>document.querySelector('#scratchFoil').value===id,foil);
    const centre=await page.locator('#scratchSurfacePreview').evaluate(canvas=>{
      const context=canvas.getContext('2d',{willReadFrequently:true});
      return [...context.getImageData(Math.floor(canvas.width*.43),Math.floor(canvas.height*.54),1,1).data].slice(0,3);
    });
    centreColours.add(centre.join(','));
    paintings.add(await page.locator('#scratchSurfacePreview').evaluate(canvas=>canvas.toDataURL('image/png')));
    const surface=await page.locator('.scratch-static-frame').evaluate(el=>({
      foil:el.dataset.foil,
      gradient:getComputedStyle(el).backgroundImage,
      canvasOpacity:getComputedStyle(el.querySelector('canvas')).opacity
    }));
    assert.equal(surface.foil,foil,'The visible ticket, not just its border, must reflect selected foil');
    assert.equal(surface.canvasOpacity,'0','Creator must display the static foil, not an unpainted Canvas');
    assert.ok(surface.gradient.startsWith('linear-gradient('),'Visible foil must fill the whole ticket');
    visibleGradients.add(surface.gradient);
    await page.screenshot({path:resolve(output,size.name+'-concert-'+foil+'.png'),fullPage:true});
   }
   assert.equal(paintings.size,4,'Each concert foil option must repaint the ticket');
   assert.equal(centreColours.size,4,'The underlying recipient Canvas must retain four genuine foil paints');
   assert.equal(visibleGradients.size,4,'The visible creator ticket must show four different full-size metallic colour gradients');
   const ratio=await page.locator('#scratchSurfacePreview').evaluate(node=>{
    const bounds=node.getBoundingClientRect();return bounds.width/bounds.height;
   });
   assert.ok(Math.abs(ratio-3)<.18,'Concert preview stays landscape');
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
   const tabSelector='#concertPreviewTabsDesktop';
   assert.equal(await page.locator(tabSelector+':visible').count(),1);
   await page.locator('#recipient').fill('Chloe');
   await page.locator('#sender').fill('Michael');
   await page.locator('#personalMessage').fill('A night to remember!');
   await page.locator('#eventName').fill('Live Music at the Hall');
   await page.locator('#eventSubtitle').fill('A very special evening');
   await page.locator('#venue').fill('The Grand Hall');
   await page.locator('#venueAddress').fill('London, England');
   await page.locator('#level').fill('3');
   await page.locator('#section').fill('Balcony');
   await page.locator('#row').fill('G');
   await page.locator('#seat').fill('18');
   await page.locator('#gate').fill('A');
   assert.equal(await page.locator('#ticketPrice').count(),0,'No ticket price or face-value field');
   assert.equal(await page.locator('#ticketNumber').count(),0,'Ticket number field is removed');
   assert.equal(await page.locator('#supportAct').count(),0,'Special guest field is removed');
   assert.equal(await page.locator('#concertTicketDetailsSection [required]').count(),0,
     'All ticket information fields remain optional');
   await page.locator('#eventDate').fill('2027-03-20');
   await page.locator('#eventTime').fill('19:30');
   await page.locator('#ticketUrl').fill('https://example.org/tickets/123');
   await page.locator('.concert-template-option[data-value="premium-headliner"]').click();
   assert.equal(await page.locator('body').getAttribute('data-concert-preview'),'revealed');
   assert.equal(await page.locator('#concertRevealedPreviewFrame:visible').count(),1);
   assert.equal(await page.locator('.scratch-static-frame:visible').count(),0);
   assert.equal((await page.locator('#concertLiveEvent').textContent()).trim(),'Live Music at the Hall');
   const details=await page.locator('#concertLiveFields').textContent();
   for(const value of ['The Grand Hall','London, England']){
    assert.ok(details.includes(value),'Main ticket must include '+value);
   }
   const stubDetails=await page.locator('#concertLiveStubFields').textContent();
   for(const value of ['Balcony','G','18','A']){
    assert.ok(stubDetails.includes(value),'Detachable ticket stub must include '+value);
   }
   assert.equal(await page.locator('#ticketPrice').count(),0);
   assert.equal(await page.locator('#concertLiveFields [value*="£"]').count(),0);
   const liveRect=await page.locator('#concertRevealedPreviewFrame').boundingBox();
   assert.ok(Math.abs(liveRect.width/liveRect.height-3)<.18,
     'Revealed preview must retain exact ticket proportions, never grow into a poster');
   await page.screenshot({path:resolve(output,size.name+'-concert-headliner-before-assertion.png'),fullPage:true});
   const bottomSpace=await page.locator('#concertRevealedPreviewFrame').evaluate(frame=>{
     const last=frame.querySelector('#concertLiveFields > div:last-child');
     return {height:frame.getBoundingClientRect().height,
       remaining:frame.getBoundingClientRect().bottom-last.getBoundingClientRect().bottom,
       pad:getComputedStyle(frame.querySelector('.concert-live-main')).paddingBottom};
   });
   assert.ok(bottomSpace.remaining >= bottomSpace.height*.07,
     'Last concert ticket detail must sit safely inside the safe bottom margin: '+JSON.stringify(bottomSpace));
   assert.equal((await page.locator('#concertLiveSubtitle').textContent()).trim(),'A very special evening');
   assert.match(await page.locator('#concertLiveRecipient').textContent(),/Chloe/);
   assert.equal(await page.locator('#concertLiveSender:visible').count(),0,
     'Sender belongs with the personal message, not another vertical stub stripe');
   assert.equal((await page.locator('#concertLiveMessage').textContent()).trim(),'A night to remember!');
   assert.equal(await page.locator('#concertLiveQr, .ct-reference-qr').count(),0);
   assert.equal(await page.locator('#concertLiveLink').getAttribute('title'),'https://example.org/tickets/123');
   const background=await page.locator('#concertRevealedPreviewFrame').evaluate(e=>getComputedStyle(e).backgroundImage);
   assert.ok(background==='none'||background.includes('classic.svg'));
   assert.equal(await page.locator('#concertRevealedPreviewFrame svg.ct-reference-art').count(),1,
     'Reference-specific drawing replaces the old background-only design');
   if(size.name==='mobile'){
     await page.locator('#concertZoomButton').click();
     assert.equal(await page.locator('body').getAttribute('data-concert-zoom'),'open');
     const pan=await page.locator('#scratchDesktopDock').evaluate(el=>({
       client:el.clientWidth,scroll:el.scrollWidth
     }));
     assert.ok(pan.scroll>pan.client+250,'Full-size ticket preview must be horizontally inspectable on phones');
     await page.locator('#concertZoomButton').click();
   }

   // Also verify the reverse ticket silhouette used in the reported iPhone image.
   await page.locator('.concert-template-option[data-value="editorial-concert"]').click();
   await page.locator('#concertPreviewTabsDesktop [data-preview-mode="revealed"]').click();
   // Realistically sized portrait photo to exercise the overlap on iPhone.
   await page.evaluate(async()=>{
     const canvas=document.createElement('canvas');canvas.width=600;canvas.height=800;
     const context=canvas.getContext('2d');
     context.fillStyle='#3c3355';context.fillRect(0,0,600,800);
     const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
     const transfer=new DataTransfer();
     transfer.items.add(new File([blob],'concert-poster.png',{type:'image/png'}));
     const input=document.getElementById('image');
     input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
   });
   await page.locator('#concertLiveImage:not([hidden])').waitFor();

   const integrity=await page.locator('#concertRevealedPreviewFrame').evaluate(frame=>{
     const main=frame.querySelector('.concert-live-main'),img=frame.querySelector('#concertLiveImage');
     const card=frame.getBoundingClientRect(),parent=main.getBoundingClientRect(),poster=img.getBoundingClientRect();
     const nodes=[...frame.querySelectorAll('.concert-live-headnote,#concertLiveEvent,#concertLiveSubtitle,.concert-live-fields dt,.concert-live-fields dd')]
       .filter(el=>!el.hidden&&getComputedStyle(el).display!=='none');
     const overlap=(a,b)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
     const inside=r=>r.left>=parent.left-1&&r.right<=parent.right+1&&r.top>=parent.top-1&&r.bottom<=parent.bottom+1;
     return {ratio:card.width/card.height,grid:getComputedStyle(main).display,
       area:getComputedStyle(img).gridArea,posterInside:inside(poster),
       overlap:nodes.filter(n=>overlap(n.getBoundingClientRect(),poster)).map(n=>n.id||n.tagName),
       overflow:nodes.filter(n=>!inside(n.getBoundingClientRect())).map(n=>n.id||n.tagName)};
   });
   assert.ok(Math.abs(integrity.ratio-3)<.18,'Ticket aspect ratio is 3:1');
   assert.equal(integrity.grid,'grid','Preset uses a fixed CSS grid');
   assert.equal(integrity.area,'image','Poster is assigned to image grid zone');
   assert.equal(integrity.posterInside,true,'Poster must be fully contained');
   assert.deepEqual(integrity.overlap,[],'Poster must not overlap any printed text');
   // The reference SVG is the visible printed ticket. Legacy HTML is retained
   // for form bindings and may have a different layout beneath the opaque SVG.
   const printed=await page.locator('#concertRevealedPreviewFrame svg.ct-reference-art').evaluate(svg=>{
     const frame=svg.getBoundingClientRect(), photo=svg.querySelector('image');
     const p=photo?.getBoundingClientRect();
     const inside=r=>r.left>=frame.left-1&&r.right<=frame.right+1&&r.top>=frame.top-1&&r.bottom<=frame.bottom+1;
     const overlap=(a,b)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
     const text=[...svg.querySelectorAll('text')];
     return {photo:!!p&&inside(p),textCount:text.length,
       overflow:text.filter(n=>!inside(n.getBoundingClientRect())).map(n=>n.textContent),
       overlap:p?text.filter(n=>overlap(n.getBoundingClientRect(),p)).map(n=>n.textContent):[]};
   });
   assert.ok(printed.textCount>0,'Rendered ticket contains printed text');
   assert.equal(printed.photo,true,'Printed photo is contained in ticket');
   assert.deepEqual(printed.overflow,[],'Visible printed text stays inside ticket');
   assert.deepEqual(printed.overlap,[],'Visible printed text does not overlap photo');
   if(size.name==='mobile'){
     await page.locator('#concertZoomButton').click();
     const zoomRatio=await page.locator('#concertRevealedPreviewFrame')
       .evaluate(e=>e.getBoundingClientRect().width/e.getBoundingClientRect().height);
     assert.ok(Math.abs(zoomRatio-3)<.18,'iPhone zoom retains 3:1 ratio');
     await page.screenshot({path:resolve(output,'mobile-zoom-ticket-print-safe.png'),fullPage:true});
     await page.locator('#concertZoomButton').click();
   }
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
test('amending a saved Concert Ticket never displays the 20-artwork Scratch Card editor, including old edit links',
 {timeout:70000},async()=>{
 const {server,base}=await startServer();
 const browser=await browserType.launch({headless:true});
 try{
  for(const suffix of ['','&variant=concert']){
   const page=await browser.newPage({viewport:{width:1120,height:820},reducedMotion:'reduce'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{
     try{localStorage.setItem('reveal_edit_saved-concert','owner-test-token')}catch{}
   });
   let release;
   const gate=new Promise(resolve=>{release=resolve});
   await page.route('**/api/reveals/saved-concert/scratch-surface',route=>route.fulfill({
     status:200,contentType:'application/json',body:JSON.stringify({
       success:true,surface:{variant:'concert',style:'concert',foil:'midnight',
         hasImage:false,ticketTemplate:'side-perforations',revealTheme:'concert-lights',linkMode:'link',
         ticketDetails:{seat:'18',row:'G'}},audio:{enabled:false}
     })
   }));
   await page.route('**/api/reveals/saved-concert',async route=>{
     await gate;
     await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
       success:true,reveal:{status:'draft',revision:1,recipient:'Chloe',sender:'Michael',
       eventName:'Live in Concert',eventDate:'2027-04-20',eventTime:'19:00',
       venue:'Royal Hall',admit:'Two',hasImage:false,personalMessage:'Surprise!',ticketUrl:''}
     })});
   });
   try{
    await page.goto(base+'/legacy-create?edit=saved-concert'+suffix,{waitUntil:'domcontentloaded'});
    await page.locator('#savedRevealLoadStatus:visible').waitFor();
    assert.equal(await page.locator('.page:visible').count(),0,
      'No generic Scratch Card creator must be visible while saved concert details load');
    assert.equal(await page.locator('#scratchArtworkSection:visible').count(),0);
   }finally{release()}
   await page.locator('#concertTemplateSection:visible').waitFor();
   assert.equal(await page.locator('body').getAttribute('data-ticket-variant'),'concert');
   assert.equal(await page.locator('#scratchArtworkSection:visible').count(),0);
   assert.equal(await page.locator('#scratchFoil').inputValue(),'midnight');
   assert.equal(await page.locator('#concertRevealedPreviewFrame').count(),1);
   assert.equal(await page.locator('#savedRevealLoadStatus:visible').count(),0);
   assert.equal((await page.locator('#concertLiveEvent').textContent()).trim(),'Live in Concert');
   assert.deepEqual(errors,[]);
   await page.close();
  }
 }finally{await browser.close();await new Promise(done=>server.close(done));}
});
test('concert owner static review remains a landscape 3:1 ticket, not a tall poster',
 {timeout:40000},async()=>{
 const browser=await browserType.launch({headless:true});
 try{
  const source=await readFile(resolve(root,'reveal.html'),'utf8');
  const style=(await readFile(resolve(root,'concert-ticket-premium.css'),'utf8'))+'\n'+
    (await readFile(resolve(root,'concert-layout-presets.css'),'utf8'));
   const html=source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
     .replace('</head>','<style>'+style+'</style></head>');
  for(const size of [{name:'mobile',width:390,height:844},{name:'desktop',width:1380,height:900}]){
   const page=await browser.newPage({viewport:size,deviceScaleFactor:1,reducedMotion:'reduce'});
   await page.setContent(html,{waitUntil:'domcontentloaded'});
   // A page created via setContent has no site origin; load the same
   // production Concert Ticket stylesheet directly for a meaningful
   // owner-review visual acceptance instead of testing only inline CSS.
   await page.addStyleTag({content:style});
   await page.evaluate(()=>{
     document.body.dataset.ticketVariant='concert';
     document.getElementById('reviewContent').hidden=false;
     document.getElementById('reviewEventHeading').textContent='Chloe';
     document.getElementById('ticketTitle').textContent='Jesus Christ Superstar';
     document.getElementById('reviewVenueRow').hidden=false;
     document.getElementById('reviewVenue').textContent='Theatre Royal, Drury Lane';
     document.getElementById('reviewDateRow').hidden=false;
     document.getElementById('reviewDate').textContent='Saturday, 21 November 2026';
     document.getElementById('reviewTimeRow').hidden=false;
     document.getElementById('reviewTime').textContent='21:12';
     const extra=document.getElementById('reviewConcertExtra');
     extra.hidden=false;
     for(const [label,value] of [['VENUE ADDRESS','Example Street, London'],['LEVEL','3']]){
       const cell=document.createElement('div');
       const name=document.createElement('span');name.className='detail-label';name.textContent=label;
       const text=document.createElement('span');text.className='detail-value';text.textContent=value;
       cell.append(name,text);extra.append(cell);
     }
     // Match the saved-owner review's two-row details arrangement.
     extra.prepend(document.getElementById('reviewVenueRow'));
     const shell=document.querySelector('.review-shell');
     shell.dataset.concertTheme='backstage';
     shell.dataset.concertLayout='premium-headliner';
     shell.dataset.hasImage='false';
     const ticket=shell.querySelector('.ticket');
     const stub=shell.querySelector('.review-heading');
     ticket.querySelector('#ticketTitle').after(document.getElementById('imageWrap'));
     const zone=document.createElement('div');zone.className='ct-detail-zone';
     ticket.querySelector('.details').before(zone);
     zone.append(ticket.querySelector('.details'),extra);
     stub.append(document.getElementById('bookingCard'));
     const rows=document.getElementById('reviewConcertStubRows');
     rows.hidden=false;
     for(const [label,value] of [['SECTION','Stalls'],['ROW','G'],['SEAT','18'],['GATE','A2']]){
       const cell=document.createElement('div');
       const small=document.createElement('small');small.textContent=label;
       const strong=document.createElement('strong');strong.textContent=value;
       cell.append(small,strong);rows.append(cell);
     }
     document.getElementById('bookingCard').hidden=false;
     document.querySelector('#bookingCard .booking-label').textContent='Official ticket or booking link';
     document.getElementById('bookingValue').textContent='Optional booking link';
   });
   const layout=await page.evaluate(()=>{
     const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();
       return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
     return {card:rect('.review-shell'),main:rect('.review-shell>.ticket'),
       stub:rect('.review-shell>.review-heading'),
       booking:rect('.review-shell #bookingCard'),stubRows:rect('#reviewConcertStubRows')};
   });
   assert.ok(Math.abs(layout.card.width/layout.card.height-3)<.18,
     'Owner review must match the original ticket template ratio at any screen width');
   assert.ok(layout.main.right <= layout.stub.x+2,'Main panel must end at detachable stub');
   assert.ok(layout.stubRows.height > 0,'Stub must contain four grouped seating details');
   const print=await page.evaluate(()=>{
     const shell=document.querySelector('.review-shell');
     const sample=document.querySelector('#reviewConcertStubRows>div');
     const printedMain=shell.querySelector('article.ticket');
     return {border:getComputedStyle(printedMain,'::before').display,
       inset:getComputedStyle(printedMain,'::before').top,
       orientation:getComputedStyle(sample).writingMode,
       rotation:getComputedStyle(sample).transform,
       background:getComputedStyle(document.querySelector('.review-shell>.ticket')).backgroundImage};
   });
   assert.equal(print.border,'none','The old problematic inner border is not rendered');
   assert.equal(print.orientation,'vertical-rl','Stub credentials must read at 90 degrees');
   assert.notEqual(print.rotation,'none','Stub values must be rotated');
   assert.ok(print.background.includes('linear-gradient('),'Show designer event artwork, not boxed form fields');
   const stubStyle=await page.locator('.review-shell>.review-heading').evaluate(node=>({
     color:getComputedStyle(node).backgroundColor,
     printedBarcode:getComputedStyle(node.querySelector('.ct-barcode-art')).backgroundImage
   }));
   assert.notEqual(stubStyle.color,'rgba(0, 0, 0, 0)','Stub should have its own contrasting printed background');
   assert.match(stubStyle.printedBarcode,/repeating-linear-gradient/,
     'The reference-style printed barcode strip must exist as an actual decorative element');
   assert.ok(layout.booking.bottom <= layout.card.bottom+1,'QR/link must not expand the ticket');
   assert.ok(layout.card.height < (size.name==='desktop'?570:230),
     'Concert owner review must not expand vertically like the former poster');
   if(size.name==='desktop'){
     const bottomSpace=await page.locator('.review-shell').evaluate(frame=>{
       const last=frame.querySelector('#reviewConcertExtra > div:last-child');
       return {height:frame.getBoundingClientRect().height,
         remaining:frame.getBoundingClientRect().bottom-last.getBoundingClientRect().bottom};
     });
     assert.ok(bottomSpace.remaining >= bottomSpace.height*.07,
       'Owner concert details must have space above the clean print-safe edge: '+JSON.stringify(bottomSpace));
   }
   // Owner's static cover must use the SAVED foil. The original thumbnail's
   // gold fallback must never paint over a selected Midnight/Silver/Rose cover.
   assert.ok(source.includes('ownerFoilSurface.dataset.foil='),
     'Owner review must bind the saved foil to the thumbnail');
   const foils=new Set();
   for(const finish of ['gold','silver','midnight','rose']){
     const paint=await page.locator('.scratch-surface-thumb').evaluate((thumb,foil)=>{
       thumb.dataset.foil=foil;
       return {gradient:getComputedStyle(thumb).backgroundImage,
         opacity:getComputedStyle(thumb.querySelector('canvas')).opacity};
     },finish);
     assert.match(paint.gradient,/linear-gradient/);
     assert.equal(paint.opacity,'0','Static owner preview must show the saved full-card foil, not transparent Canvas');
     foils.add(paint.gradient);
     if(finish==='midnight')assert.match(paint.gradient,/7, 15, 40|7,15,40|#070F28/i,
       'Midnight foil must not render gold');
   }
   assert.equal(foils.size,4,'Four saved foil choices must show four different owner-review surfaces');
   await page.screenshot({path:resolve(output,size.name+'-concert-owner-review-compact.png'),fullPage:true});
   await page.close();
  }
 }finally{await browser.close();}
});
test('legacy paid concert QR configuration provides a clickable booking link after scratching',
 {timeout:90000},async()=>{
 const {server,base}=await startServer();
 const browser=await browserType.launch({headless:true});
 try{
   const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/r/concert-qr',{waitUntil:'networkidle'});
   await page.locator('#card.foil-ready').waitFor();
   assert.equal(await page.locator('#card').getAttribute('data-concert-theme'),'backstage');
   const card=await page.locator('#card').boundingBox();
   assert.ok(Math.abs(card.width/card.height-3)<.18,'Recipient ticket must remain landscape 3:1');
   assert.equal(await page.locator('#concertStubFields .ticket-item').count(),4,
     'Use just four separated ticket credentials rather than six narrow vertical columns');
   assert.equal(await page.locator('#recipientConcertNumber').count(),0,
     'Legacy reference must not appear on recipient ticket');
    assert.equal(await page.locator('#concertQrRow, .ct-reference-qr').count(),0);
    assert.equal(await page.locator('#bookingUrl').getAttribute('href'),'https://example.org/concert?t=42');
    assert.equal(await page.locator('#bookingAction').getAttribute('href'),'https://example.org/concert?t=42');
   assert.equal(await page.locator('#bookingAction:visible').count(),0);
   assert.equal(await page.locator('#concertFullTicketButton:visible').count(),0,
     'Full-size recipient view must be inaccessible until the scratch progress threshold');
    // Scratch using real pointer events, rather than manually unlocking the button.
    const foil=await page.locator('#foilCanvas').boundingBox();
    for(let y=foil.y+6;y<foil.y+foil.height;y+=12){
      await page.mouse.move(foil.x+5,y);
      await page.mouse.down();
      await page.mouse.move(foil.x+foil.width-5,y,{steps:20});
      await page.mouse.up();
    }
    await page.locator('#bookingAction:visible').waitFor({timeout:15000});
    assert.equal(await page.locator('#bookingAction').getAttribute('target'),'_blank');
    assert.equal(await page.locator('#concertFullTicketButton:visible').count(),1);
   await page.locator('#concertFullTicketButton').click();
   assert.equal(await page.locator('#concertFullTicketDialog[open]').count(),1);
   const large=await page.locator('#concertFullTicketScroll>.card').boundingBox();
   assert.ok(large.width>=800,'Once unlocked, full-size recipient ticket should be readable on mobile');
   const zoomState=await page.locator('#concertFullTicketDialog .card.concert-ticket .ticket h2')
     .evaluate(el=>({font:parseFloat(getComputedStyle(el).fontSize),
       ticketVariant:document.body.dataset.ticketVariant,
       media:matchMedia('(max-width:700px)').matches,
       html:el.outerHTML.slice(0,220),
       sheets:[...document.styleSheets].map(sheet=>sheet.href).filter(Boolean)}));
   assert.ok(zoomState.font>=24,'Full-size paid ticket must enlarge text, not just the background: '+JSON.stringify(zoomState));
   assert.equal(await page.locator('#concertFullTicketScroll .ticket-underlay').count(),1);
   await page.locator('#concertCloseZoom').click();
   assert.equal(await page.locator('#concertFullTicketDialog[open]').count(),0);
   assert.equal(await page.locator('body').getAttribute('data-ticket-variant'),'concert');
   assert.equal(await page.locator('#ticketGrid').textContent().then(v=>v.includes('London, England')),true);
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


test('all four selectable concert layouts keep photo and text in locked zones at phone and desktop widths',
 {timeout:120000},async()=>{
 const {server,base}=await startServer();
 const browser=await browserType.launch({headless:true});
 const names=['premium-headliner','promo-poster','neon-tour','editorial-concert'];
 try{
  for(const size of [{name:'mobile',width:390,height:844},{name:'desktop',width:1380,height:900}]){
   const page=await browser.newPage({viewport:size,reducedMotion:'reduce'});
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(base+'/legacy-create?variant=concert',{waitUntil:'networkidle'});
   await page.locator('#concertTemplateChoices .concert-template-option:enabled').first().waitFor();
   await page.locator('#recipient').fill('Chloe');
   await page.locator('#eventName').fill('Jesus Christ Superstar');
   await page.locator('#eventSubtitle').fill('A musical spectacular');
   await page.locator('#venue').fill('Theatre Royal, Drury Lane');
   await page.locator('#venueAddress').fill('London, England');
   await page.locator('#level').fill('Royal Circle');
   await page.locator('#section').fill('Stalls');
   await page.locator('#row').fill('G');
   await page.locator('#seat').fill('18');
   await page.locator('#gate').fill('A');
   await page.locator('#eventDate').fill('2027-04-10');
   await page.locator('#eventTime').fill('19:30');
   for(const name of names){
    await page.locator('.concert-template-option[data-value="'+name+'"]').click();
    const result=await page.locator('#concertRevealedPreviewFrame').evaluate(frame=>{
      const panel=frame.querySelector('.concert-live-main');
      return {layout:frame.dataset.concertLayout,mode:frame.dataset.hasImage,
        ratio:frame.getBoundingClientRect().width/frame.getBoundingClientRect().height,
        columns:getComputedStyle(panel).gridTemplateColumns.split(' ').filter(Boolean).length};
    });
    const reference=await page.locator('#concertRevealedPreviewFrame').evaluate(frame=>{
      const art=frame.querySelector(':scope > svg.ct-reference-art');
      return {preset:art?.getAttribute('data-reference-preset')||frame.dataset.referenceLayout,
        count:frame.querySelectorAll(':scope > svg.ct-reference-art').length,
        viewBox:art?.getAttribute('viewBox'),ratio:art?.getBoundingClientRect().width/art?.getBoundingClientRect().height,
        caption:art?.textContent,eventTitle:art?.getAttribute('data-event-title')};
    });
    assert.equal(reference.count,1,'The source-specific SVG ticket must be visible');
    assert.equal(reference.viewBox,'0 0 2000 647','Reference layout uses exact wide source proportions');
    assert.equal(reference.preset,name,'The selected reference artwork must change with each preset');
    assert.ok(Math.abs(reference.ratio-2000/647)<.02,'Artwork must scale without reflow');
    assert.equal(reference.eventTitle,'Jesus Christ Superstar','Artwork uses purchaser title, not example text');
    assert.equal(result.layout,name,'Selected layout must render rather than just change thumbnail');
    assert.equal(result.mode,'false','Without an upload no image lane should be reserved');
    assert.ok(Math.abs(result.ratio-3)<.18,'Every preset must be a wide 3:1 ticket');
    assert.equal(result.columns,1,'No-image ticket should expand its text area');
    await page.locator('#concertRevealedPreviewFrame').screenshot({
      path:resolve(output,size.name+'-reference-no-image-'+name+'.png')
    });
   }
   await page.evaluate(async()=>{
     const canvas=document.createElement('canvas');canvas.width=600;canvas.height=800;
     const ctx=canvas.getContext('2d');ctx.fillStyle='#5a3d8f';ctx.fillRect(0,0,600,800);
     const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
     const transfer=new DataTransfer();
     transfer.items.add(new File([blob],'concert-poster.png',{type:'image/png'}));
     const upload=document.getElementById('image');
     upload.files=transfer.files;upload.dispatchEvent(new Event('change',{bubbles:true}));
   });
   await page.locator('#concertLiveImage:not([hidden])').waitFor();
   for(const name of names){
    await page.locator('.concert-template-option[data-value="'+name+'"]').click();
    const layout=await page.locator('#concertRevealedPreviewFrame').evaluate(frame=>{
      const panel=frame.querySelector('.concert-live-main');
      const photo=frame.querySelector('#concertLiveImage');
      const rect=panel.getBoundingClientRect(),pic=photo.getBoundingClientRect();
      const art=frame.querySelector(':scope > svg.ct-reference-art');
      const paper=art.getBoundingClientRect();
      const nodes=[...art.querySelectorAll('text')];
      const inside=r=>r.left>=rect.left-1&&r.right<=rect.right+1&&r.top>=rect.top-1&&r.bottom<=rect.bottom+1;
      const inPrint=r=>r.left>=paper.left-2&&r.right<=paper.right+2&&r.top>=paper.top-2&&r.bottom<=paper.bottom+2;
      // The previous DOM is a hidden data source underneath the new ticket.
      // Measure the printed SVG, not old invisible CSS text rows.
      const wrong=nodes.filter(el=>!inPrint(el.getBoundingClientRect()))
        .map(el=>{const r=el.getBoundingClientRect();return {
          text:el.textContent.slice(0,28),
          left:Math.round(r.left-paper.left),right:Math.round(r.right-paper.left),
          top:Math.round(r.top-paper.top),bottom:Math.round(r.bottom-paper.top)
        };});
      return {layout:frame.dataset.concertLayout,image:frame.dataset.hasImage,
        grid:getComputedStyle(panel).display,
        posterArea:getComputedStyle(photo).gridArea,photoInside:inside(pic),wrong,
        mainWidth:rect.width,mainHeight:rect.height,
        columns:getComputedStyle(panel).gridTemplateColumns,
        rows:getComputedStyle(panel).gridTemplateRows,
        photoRect:{left:Math.round(pic.left-rect.left),top:Math.round(pic.top-rect.top),
          right:Math.round(pic.right-rect.left),bottom:Math.round(pic.bottom-rect.top)},
        photoWidth:pic.width};
    });
    await page.screenshot({path:resolve(output,size.name+'-diagnostic-'+name+'.png'),fullPage:true});
    const refImage=await page.locator('#concertRevealedPreviewFrame').evaluate(frame=>{
      const image=frame.querySelector(':scope > svg.ct-reference-art image[href^="blob:"]');
      return image?{x:Number(image.getAttribute('x')),width:Number(image.getAttribute('width'))}:null;
    });
    const expectedImage={ 'premium-headliner':[139,478],
      'promo-poster':[489,200],'neon-tour':[400,1600],'editorial-concert':[1314,686]};
    assert.deepEqual(refImage,{x:expectedImage[name][0],width:expectedImage[name][1]},
      'Uploaded image must occupy the exact dedicated photo coordinates for '+name);
    const titleSafety=await page.locator('#concertRevealedPreviewFrame').evaluate(frame=>{
      const art=frame.querySelector(':scope > svg.ct-reference-art');
      const titles=[...art.querySelectorAll('g[data-ct-role="title"]')];
      const subtitles=[...art.querySelectorAll('g[data-ct-role="subtitle"]')];
      const overlaps=[];
      for(const a of titles)for(const b of subtitles){
        const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();
        if(x.left<y.right-3&&x.right>y.left+3&&x.top<y.bottom-3&&x.bottom>y.top+3)
          overlaps.push({title:a.textContent,subtitle:b.textContent,titleBottom:x.bottom,subtitleTop:y.top});
      }
      return {count:titles.length,overlaps};
    });
    assert.ok(titleSafety.count>=1,'Reference ticket must render the event heading');
    assert.deepEqual(titleSafety.overlaps,[],
      'Headlines and optional subtitles must never collide: '+JSON.stringify(titleSafety));
    if(name==='neon-tour'){
      const admissionGap=await page.locator('#concertRevealedPreviewFrame').evaluate(frame=>{
        const art=frame.querySelector(':scope > svg.ct-reference-art');
        const admit=art.querySelector('[data-ct-role="stub-admit"]').getBoundingClientRect();
        const barcode=art.querySelector('[data-ct-role="barcode"]').getBoundingClientRect();
        return {admitRight:admit.right,barcodeLeft:barcode.left};
      });
      assert.ok(admissionGap.admitRight+3<admissionGap.barcodeLeft,
        'Neon Tour rotated ADMIT text must not overlap its barcode: '+JSON.stringify(admissionGap));
    }
    assert.equal(layout.layout,name);
    assert.equal(layout.image,'true');
    assert.equal(layout.grid,'grid');
    assert.equal(layout.posterArea,'image','Image must be in dedicated grid track');
    assert.equal(layout.photoInside,true,'Image may not cross its main panel: '+JSON.stringify(layout));
    assert.deepEqual(layout.wrong,[],'Text may not spill or overlap poster: '+JSON.stringify(layout));
    await page.locator('#concertRevealedPreviewFrame').screenshot({
      path:resolve(output,size.name+'-reference-ticket-only-'+name+'.png')
    });
    await page.screenshot({path:resolve(output,size.name+'-reference-layout-'+name+'.png'),fullPage:true});
   }
   assert.deepEqual(errors,[]);
   await page.close();
  }
 }finally{await browser.close();await new Promise(done=>server.close(done));}
});
